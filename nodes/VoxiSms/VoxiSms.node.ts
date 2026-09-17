import { randomUUID } from 'crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const ENQUEUE_URL = 'https://api.voxisms.com/v2/enqueue-message';

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
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'voxiSmsApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'SMS',
						value: 'sms',
					},
				],
				default: 'sms',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['sms'],
					},
				},
				options: [
					{
						name: 'Send',
						value: 'send',
						description: 'Send an SMS message',
						action: 'Send SMS message',
					},
				],
				default: 'send',
			},
			{
				displayName: 'Recipient',
				name: 'recipient',
				type: 'string',
				default: '',
				required: true,
				placeholder: '+15551234567',
				description: 'Phone number in E.164 format (e.g. +15551234567)',
				displayOptions: {
					show: {
						resource: ['sms'],
						operation: ['send'],
					},
				},
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The SMS message content',
				displayOptions: {
					show: {
						resource: ['sms'],
						operation: ['send'],
					},
				},
			},
			{
				displayName: 'Message ID',
				name: 'id',
				type: 'string',
				default: '',
				description: 'Optional custom message ID. A UUID will be generated automatically if left empty.',
				displayOptions: {
					show: {
						resource: ['sms'],
						operation: ['send'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource !== 'sms' || operation !== 'send') {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported`,
						{ itemIndex: i },
					);
				}

				const recipient = this.getNodeParameter('recipient', i) as string;
				const message = this.getNodeParameter('message', i) as string;
				const id = this.getNodeParameter('id', i, '') as string;

				// Serialize EXACTLY ONCE and send that string verbatim: the credential signs the
				// bytes it is handed, so re-encoding an object here would reorder keys and break
				// the signature.
				const bodyString = JSON.stringify({
					id: id || randomUUID(),
					recipient,
					message,
					source: 'n8n',
				});

				// returnFullResponse: read the status ourselves for friendly errors.
				// ignoreHttpStatusErrors: don't throw on non-2xx — we map them below.
				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'voxiSmsApi',
					{
						method: 'POST',
						url: ENQUEUE_URL,
						headers: { 'Content-Type': 'application/json' },
						body: bodyString,
						json: false,
						returnFullResponse: true,
						ignoreHttpStatusErrors: true,
					},
				);

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
					throw new NodeApiError(this.getNode(), error as JsonObject, {
						message: (error as Error).message,
						itemIndex: i,
					});
			}
		}

		return [returnData];
	}
}
