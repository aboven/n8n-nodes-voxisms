import { randomUUID } from 'crypto';
import type {
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	IDataObject,
	IExecuteFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import {
	buildSignedHeaders,
	normalizeCustomerId,
	ENQUEUE_PATH,
	STATUS_PATH,
} from '../shared/signing';

// Full URLs (the `/v2` base path lives here, in the URL). The SIGNED path is the
// base-path-stripped route constant (ENQUEUE_PATH / STATUS_PATH) — API Gateway strips
// `/v2` before the Lambda signs, so the URL path and the signed path differ on purpose.
const ENQUEUE_URL = 'https://api.voxisms.com/v2/enqueue-message';
const STATUS_URL = 'https://api.voxisms.com/v2/user/status';

// Shape of the decrypted credential fields.
interface VoxiSmsCredentials {
	customerId: string;
	secretKey: string;
}

// Best-effort JSON parse of an HTTP response body. n8n's httpRequest usually parses a
// JSON response into an object already, but a string can come back (e.g. non-JSON
// content-type); handle both so the caller always gets a plain object.
function toObject(body: unknown): IDataObject {
	if (body && typeof body === 'object') {
		return body as IDataObject;
	}
	if (typeof body === 'string') {
		try {
			return JSON.parse(body) as IDataObject;
		} catch {
			return { response: body };
		}
	}
	return {};
}

// Extract the server's `{ error }` message from a v2 error body, if present.
function serverErrorMessage(body: unknown): string | undefined {
	const parsed = toObject(body);
	return typeof parsed.error === 'string' ? parsed.error : undefined;
}

export class VoxiSms implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'VoxiSMS',
		name: 'voxiSms',
		icon: 'file:voxisms.svg',
		group: ['output'],
		version: 1,
		description: 'Send an SMS via VoxiSMS',
		defaults: {
			name: 'VoxiSMS',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'voxiSmsApi',
				required: true,
				// Wires the "Test" button in the credential modal to voxiSmsApiTest below.
				testedBy: 'voxiSmsApiTest',
			},
		],
		// Flat, single-action node (like the Zapier "Send SMS" action) — no
		// resource/operation dropdowns for a package that does exactly one thing.
		properties: [
			{
				displayName: 'Recipient',
				name: 'recipient',
				type: 'string',
				default: '',
				required: true,
				placeholder: '+15551234567',
				description: 'Phone number in E.164 format (e.g. +15551234567)',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The SMS message content',
			},
			{
				displayName: 'Message ID',
				name: 'id',
				type: 'string',
				default: '',
				description: 'Optional custom message ID. A UUID will be generated automatically if left empty.',
			},
		],
	};

	methods = {
		credentialTest: {
			// Side-effect-free credential check: a signed GET to the read-only status
			// endpoint (does NOT send an SMS). Success is HTTP 200; the endpoint returns
			// distinct failure codes we map to the same friendly messages as the Zapier
			// integration's authentication test.
			async voxiSmsApiTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const data = (credential.data ?? {}) as unknown as VoxiSmsCredentials;

				// Normalize ONCE and reuse for both the signed canonical and the customer-id
				// header (buildSignedHeaders uses this same value for both, so they can't
				// disagree).
				const customerId = normalizeCustomerId(data.customerId ?? '');
				const secretKey = data.secretKey ?? '';

				// Body-less GET: bodyString defaults to '' inside buildSignedHeaders, so the
				// canonical ends in a trailing '\n' + empty segment, matching the server's
				// `body: b""`.
				const headers = buildSignedHeaders({
					method: 'GET',
					path: STATUS_PATH,
					customerId,
					secretKey,
				});

				let statusCode: number;
				try {
					// Legacy request helper (the only one exposed to credential tests). We
					// inspect the status ourselves — resolveWithFullResponse gives us the
					// status, simple:false stops it throwing on non-2xx.
					const response = await this.helpers.request({
						method: 'GET',
						uri: STATUS_URL,
						headers,
						resolveWithFullResponse: true,
						simple: false,
					});
					statusCode = response.statusCode as number;
				} catch (error) {
					// A transport-level failure (DNS, TLS, timeout) — not an HTTP status.
					return {
						status: 'Error',
						message: `Could not reach VoxiSMS: ${(error as Error).message}`,
					};
				}

				if (statusCode === 200) {
					return { status: 'OK', message: 'Connection successful!' };
				}
				if (statusCode === 403) {
					return {
						status: 'Error',
						message:
							'Authentication failed. Check your Token, and make sure your system clock is accurate (requests must be within 5 minutes of server time).',
					};
				}
				if (statusCode === 404) {
					return {
						status: 'Error',
						message: 'Customer ID not found. Check the phone number you registered.',
					};
				}
				if (statusCode === 400) {
					return {
						status: 'Error',
						message: 'This account is not fully set up yet. Contact VoxiSMS support.',
					};
				}
				return {
					status: 'Error',
					message: 'Could not verify credentials. Check your Customer ID and Token.',
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Credentials are the same for every item; fetch and normalize ONCE.
		const credentials = (await this.getCredentials('voxiSmsApi')) as unknown as VoxiSmsCredentials;
		const customerId = normalizeCustomerId(credentials.customerId ?? '');
		const secretKey = credentials.secretKey ?? '';

		for (let i = 0; i < items.length; i++) {
			try {
				const recipient = this.getNodeParameter('recipient', i) as string;
				const message = this.getNodeParameter('message', i) as string;
				const id = this.getNodeParameter('id', i, '') as string;

				// CRITICAL INVARIANT — sign-once / send-same-bytes:
				// Serialize the body EXACTLY ONCE with JSON.stringify, sign THAT string, then
				// send THAT string verbatim on the wire. Re-serializing (or letting the HTTP
				// client re-encode an object) could reorder keys or change spacing and break
				// the signature. That's why `body` below is the string, NOT an object, and we
				// set Content-Type ourselves (json:true is intentionally NOT used).
				const bodyString = JSON.stringify({
					id: id || randomUUID(),
					recipient,
					message,
					source: 'n8n',
				});

				const headers = {
					...buildSignedHeaders({
						method: 'POST',
						path: ENQUEUE_PATH,
						customerId,
						secretKey,
						bodyString,
					}),
					'Content-Type': 'application/json',
				};

				// returnFullResponse: read the status ourselves for friendly errors.
				// ignoreHttpStatusErrors: don't throw on non-2xx — we map them below.
				// body is the already-serialized string; httpRequest sends it verbatim.
				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: ENQUEUE_URL,
					headers,
					body: bodyString,
					returnFullResponse: true,
					ignoreHttpStatusErrors: true,
				});

				const statusCode = response.statusCode;
				const body = response.body;

				if (statusCode >= 200 && statusCode < 300) {
					// Success body: { messageId, sqsMessageId }.
					returnData.push({ json: toObject(body), pairedItem: { item: i } });
					continue;
				}

				// Map the v2 API's real HTTP error statuses to friendly messages, mirroring
				// the Zapier middleware. The v2 error body shape is { error }.
				const serverError = serverErrorMessage(body);
				let friendly: string;
				if (statusCode === 401) {
					friendly =
						'Authentication failed. Check your Customer ID and Token, and make sure your system clock is accurate (within 5 minutes of server time).';
				} else if (statusCode === 400) {
					friendly = serverError || 'Bad request';
				} else if (statusCode === 405) {
					friendly = 'Method not allowed';
				} else if (statusCode >= 500) {
					friendly = serverError || 'Internal server error';
				} else {
					friendly = serverError || `Request failed with status code ${statusCode}`;
				}

				throw new NodeApiError(this.getNode(), toObject(body) as JsonObject, {
					message: friendly,
					httpCode: String(statusCode),
					itemIndex: i,
				});
			} catch (error) {
				// Honor "Continue On Fail": emit the error on this item and keep going.
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
