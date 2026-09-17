import {
	NodeApiError,
	NodeOperationError,
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type IHttpRequestOptions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';

import { verifySignature } from '../shared/verifySignature';

// Full v2 URLs. The signed canonical uses the base-path-stripped path (SUBSCRIPTIONS_PATH,
// no `/v2`) because API Gateway strips the `/v2` prefix before the Lambda sees it — the
// wire URL and the signed path deliberately differ.
const SUBSCRIPTIONS_URL = 'https://api.voxisms.com/v2/webhook-subscriptions';

// The single event type this trigger subscribes to (see openapi SubscribeRequest).
const EVENT_TYPE = 'inbound_message.received';

// Reads a header case-INsensitively. Express lowercases incoming header names, but we do not
// want to depend on that: read `x-voxisms-signature` / `x-voxisms-timestamp` defensively so a
// differently-cased proxy in front of n8n cannot make every delivery look unsigned.
function getHeaderCI(
	headers: Record<string, string | string[] | undefined>,
	name: string,
): string | string[] | undefined {
	const wanted = name.toLowerCase();
	for (const key of Object.keys(headers)) {
		if (key.toLowerCase() === wanted) {
			return headers[key];
		}
	}
	return undefined;
}

export class VoxiSmsTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'VoxiSMS Trigger',
		name: 'voxiSmsTrigger',
		icon: { light: 'file:voxisms.svg', dark: 'file:voxisms.dark.svg' },
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when your VoxiSMS number receives an inbound SMS.',
		defaults: {
			name: 'VoxiSMS Trigger',
		},
		subtitle: 'On inbound SMS',
		// No user-configurable parameters: the subscription is driven entirely by the
		// credential and the auto-generated webhook URL. Required by INodeTypeDescription.
		properties: [],
		// A trigger has no data inputs; it is fed by an incoming webhook, not an upstream node.
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				// Credential type owned by the parallel Send-SMS agent; referenced here by name.
				name: 'voxiSmsApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				// We ACK the delivery ourselves from inside webhook() so we can control the HTTP
				// status (200 vs 401) per the signature outcome — see the response policy there.
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
	};

	// Lifecycle hooks for the subscription REST-hook, run by n8n when the workflow is
	// activated/deactivated. `this` is IHookFunctions here.
	webhookMethods = {
		default: {
			// checkExists — n8n asks whether a live subscription already exists so it can skip a
			// redundant create. We treat the presence of a persisted subscriptionId as truth.
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				return staticData.subscriptionId !== undefined && staticData.subscriptionId !== null;
			},

			// create — called when the workflow is activated. Registers our webhook URL with the
			// VoxiSMS API so future inbound SMS are POSTed to it, and stashes both the returned
			// subscriptionId (to unsubscribe later) and signingSecret (to verify each delivery).
			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) {
					throw new NodeOperationError(
						this.getNode(),
						'n8n could not determine the webhook URL for this trigger',
						{ description: 'Reactivate the workflow, or restart n8n and try again.' },
					);
				}

				// Serialize EXACTLY ONCE and send that string verbatim: the credential signs the
				// bytes it is handed, so re-encoding an object here would break the signature.
				const bodyString = JSON.stringify({
					targetUrl: webhookUrl,
					eventTypes: [EVENT_TYPE],
					// The API's SubscribeRequest.provider enum is currently only
					// ['zapier','make','generic'] — 'n8n' is rejected with a 400 "unknown provider".
					// Use 'generic' until the backend adds an 'n8n' value (then flip this).
					provider: 'generic',
				});

				const options: IHttpRequestOptions = {
					method: 'POST',
					url: SUBSCRIPTIONS_URL,
					headers: { 'Content-Type': 'application/json' },
				// json:false keeps the signed bytes on the wire.
					body: bodyString,
					json: false,
					// Inspect the status ourselves so a non-2xx becomes a friendly, mapped error
					// instead of the raw axios-style throw. Mirrors the sibling integrations'
					// error mapping (Zapier middleware.js, Make attach.response.error).
					returnFullResponse: true,
					ignoreHttpStatusErrors: true,
				};

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'voxiSmsApi',
					options,
				)) as {
					statusCode: number;
					body: unknown;
				};

				// The API returns a JSON string when json:false; the helper may still parse it, so
				// tolerate both an already-parsed object and a raw string.
				const parseBody = (raw: unknown): IDataObject => {
					if (typeof raw === 'string') {
						try {
							return JSON.parse(raw) as IDataObject;
						} catch {
							return {};
						}
					}
					return (raw as IDataObject) ?? {};
				};
				const data = parseBody(response.body);

				// Non-2xx: map to the same friendly messages the sibling integrations surface, so
				// the user sees an actionable message rather than a raw HTTP error when they turn
				// the workflow on. The v2 error body shape is `{ error }`.
				if (response.statusCode < 200 || response.statusCode >= 300) {
					const serverError = typeof data.error === 'string' ? data.error : undefined;
					let message: string;
					let description: string | undefined;
					if (response.statusCode === 403 || response.statusCode === 401) {
						message = 'VoxiSMS did not accept the credentials on this request';
						description =
							'Check the Customer ID and Token in the VoxiSMS API credential, and make sure your system clock is accurate (requests must be within 5 minutes of server time).';
					} else if (response.statusCode === 404) {
						message = 'VoxiSMS could not find this Customer ID';
						description = 'Check the phone number you registered.';
					} else if (response.statusCode === 400) {
						// Per the API spec, a subscribe 400 means: invalid JSON body, a non-HTTPS or
						// private/internal targetUrl, or an unknown eventTypes/provider value. By far
						// the most common cause in practice is a webhook URL VoxiSMS cannot accept —
						// e.g. a local n8n without a public HTTPS URL — so say that explicitly.
						message = `VoxiSMS rejected the webhook subscription${serverError ? ` (${serverError})` : ''}`;
						description = `The webhook URL was "${webhookUrl}". It must be publicly reachable over HTTPS (not localhost or a private address). Set n8n's public webhook URL so it points to a publicly reachable HTTPS address, then reactivate the workflow.`;
					} else if (response.statusCode === 405) {
						message = 'VoxiSMS does not allow this request method';
					} else if (response.statusCode >= 500) {
						message = serverError || 'VoxiSMS is temporarily unavailable';
						description = 'Wait a moment and try again.';
					} else {
						message = serverError ?? `VoxiSMS returned status code ${response.statusCode}`;
					}
					throw new NodeApiError(
						this.getNode(),
						(data as JsonObject) ?? {},
						{ message, description, httpCode: String(response.statusCode) },
					);
				}

				if (!data.subscriptionId || !data.signingSecret) {
					throw new NodeOperationError(
						this.getNode(),
						'VoxiSMS did not return a subscription ID and signing secret',
						{ description: 'Deactivate and reactivate this trigger to try registering the subscription again.' },
					);
				}

				const staticData = this.getWorkflowStaticData('node');
				staticData.subscriptionId = data.subscriptionId;
				// The signingSecret is what verifies every future delivery. Without it we cannot
				// authenticate deliveries, so it MUST be persisted alongside the subscriptionId.
				staticData.signingSecret = data.signingSecret;

				return true;
			},

			// delete — called when the workflow is deactivated. Removes the subscription so the
			// API stops POSTing to a webhook URL that is no longer live, then clears static data.
			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const subscriptionId = staticData.subscriptionId as string | undefined;

				// Nothing registered (or already cleared) — treat as success, nothing to undo.
				if (!subscriptionId) {
					return true;
				}

				const options: IHttpRequestOptions = {
					method: 'DELETE',
					url: `${SUBSCRIPTIONS_URL}/${subscriptionId}`,
					// A 404 means the subscription is already gone server-side — that is the desired
					// end state, so do not throw on it; ignore HTTP status errors and treat as done.
					ignoreHttpStatusErrors: true,
				};

				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'voxiSmsApi', options);
				} catch (error) {
					// Network/other failure while unsubscribing: swallow it so deactivation still
					// clears local state. A stale server-side subscription will simply deliver to a
					// URL that now rejects, which is harmless (and re-activation re-creates one).
					this.logger.warn(
						`VoxiSMS: could not remove webhook subscription ${subscriptionId}: ${(error as Error).message}`,
					);
				}

				// Always clear both keys so a later checkExists reports "no subscription" and a
				// re-activation creates a fresh one with a fresh signing secret.
				delete staticData.subscriptionId;
				delete staticData.signingSecret;

				return true;
			},
		},
	};

	// webhook — runs for every delivery the API POSTs to our URL. n8n has NOT yet responded to
	// the HTTP request, so this method both decides the HTTP status AND whether to fire the
	// workflow. We mirror the Make webhook's response policy exactly (see communication.json):
	//   - signing secret missing  → surface loudly (config broken; user must recreate trigger)
	//   - reason 'missing'         → 200 {ok:false}, DO NOT fire (unsigned noise, drop quietly)
	//   - reason invalid|skew|unverifiable → 401, DO NOT fire (present but bad → surface)
	//   - ok                       → 200 {ok:true}, fire with the parsed event JSON (one item)
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();

		// The signature is computed over the EXACT raw request bytes. n8n populates
		// `req.rawBody` (a Buffer) for webhook requests via its raw-body reader middleware;
		// the property is declared on http.IncomingMessage by n8n-workflow's type augmentation.
		// We deliberately do NOT fall back to re-serializing the parsed body (getBodyData()) —
		// a re-serialize reorders keys / changes whitespace and would break the digest by
		// design. If the raw bytes are somehow absent, verifySignature returns 'unverifiable'
		// (a present signature we cannot check) and we surface a 401 rather than trust it.
		const rawBuffer: Buffer | undefined = req.rawBody;
		const rawBody = Buffer.isBuffer(rawBuffer) ? rawBuffer.toString('utf8') : undefined;

		const headers = req.headers as Record<string, string | string[] | undefined>;
		const signatureHeader = getHeaderCI(headers, 'x-voxisms-signature');
		const timestampHeader = getHeaderCI(headers, 'x-voxisms-timestamp');

		// Config-drift guard: without a signing secret we can verify nothing, and
		// createHmac('sha256', undefined) would throw a bare TypeError. This means the
		// subscription was created without persisting the secret (or static data was wiped) —
		// surface it loudly so the user recreates the trigger. Do not ACK, do not fire.
		const staticData = this.getWorkflowStaticData('node');
		const signingSecret = staticData.signingSecret as string | undefined;
		if (!signingSecret) {
			throw new NodeOperationError(
				this.getNode(),
				"The subscription's signing secret is missing, so this delivery cannot be verified",
				{ description: 'Deactivate and reactivate this trigger to recreate the subscription.' },
			);
		}

		const result = verifySignature({
			signingSecret,
			rawBody,
			signatureHeader,
			timestampHeader,
		});

		if (!result.ok) {
			if (result.reason === 'missing') {
				// No usable signature header: unsigned noise (health checks, scanners, a stray
				// POST). ACK with 200 {ok:false} so the sender does not retry, but DO NOT fire —
				// returning noWebhookResponse hands the HTTP response to us, and no workflowData
				// means no execution.
				res.status(200).json({ ok: false });
				return { noWebhookResponse: true };
			}

			// Present but invalid / skewed / unverifiable: almost always secret/config drift or a
			// replay attempt. Reject with 401 and DO NOT fire — surfaced via the HTTP status so
			// the caller (and VoxiSMS delivery logs) can see the rejection.
			res.status(401).json({ ok: false, reason: result.reason });
			return { noWebhookResponse: true };
		}

		// Verified. Parse the (now trusted) raw bytes into the InboundMessageEvent object. We
		// parse rawBody ourselves rather than getBodyData() so the emitted item is exactly the
		// bytes we authenticated — no chance of a divergent second parse.
		//
		// Can't-happen-unless-server-bug guard: the signature already verified, so the sender is
		// authentic and the bytes are what VoxiSMS signed — a malformed JSON body here would mean
		// a server-side bug. If we let JSON.parse throw, it would escape webhook(), n8n would 500
		// the delivery, and VoxiSMS would retry the same poison delivery indefinitely. Instead we
		// ACK with 400 {ok:false} (so the sender stops retrying) and DO NOT fire the workflow.
		let event: IDataObject;
		try {
			event = JSON.parse(rawBody as string) as IDataObject;
		} catch {
			res.status(400).json({ ok: false, reason: 'malformed' });
			return { noWebhookResponse: true };
		}

		// NOTE: webhook deliveries are AT-LEAST-ONCE and n8n does NOT de-duplicate them. A
		// dispatcher retry carrying the same `eventId` WILL fire this workflow again. We expose
		// `eventId` on the emitted item so downstream steps (or the user) can de-duplicate on it
		// if they need exactly-once semantics.
		res.status(200).json({ ok: true });
		return {
			noWebhookResponse: true,
			workflowData: [this.helpers.returnJsonArray([event])],
		};
	}
}
