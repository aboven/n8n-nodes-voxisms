import type {
	IAuthenticate,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

import { buildSignedHeaders, normalizeCustomerId, STATUS_PATH } from '../nodes/shared/signing';

const BASE_URL = 'https://api.voxisms.com/v2';

// The public HMAC contract signs the route without the `/v2` base path.
const signedPath = (url: string): string => new URL(url).pathname.replace(/^\/v2/, '');

// The bytes on the wire must be the bytes that were signed: a pre-serialized string is
// passed through untouched, an object is serialized exactly once here.
const bodyToSign = (body: IHttpRequestOptions['body']): string => {
	if (body === undefined || body === null) {
		return '';
	}
	return typeof body === 'string' ? body : JSON.stringify(body);
};

export class VoxiSmsApi implements ICredentialType {
	name = 'voxiSmsApi';

	displayName = 'VoxiSMS API';

	icon: Icon = { light: 'file:../nodes/VoxiSms/voxisms.svg', dark: 'file:../nodes/VoxiSms/voxisms.dark.svg' };

	// API access is managed inside the phone-group cards.
	documentationUrl = 'https://app.voxiplan.com/voxisms';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Create an API key under API access in your phone group. Leave empty only for an existing phone-number connection.',
		},
		{
			// The customer identifier is the registered phone number. We normalize away a
			// pasted leading "+" / spaces at sign time (normalizeCustomerId), but ask users
			// to enter it without the "+" to match what they see in the dashboard.
			displayName: 'Legacy Customer ID',
			name: 'customerId',
			type: 'string',
			default: '',
			displayOptions: { show: { apiKey: [''] } },
			placeholder: 'e.g. 12025550101',
			description:
				'Enter the phone number you registered, without the leading "+" (e.g. 12025550101). You can find it under "Register your number" on the "Link your phone" page (https://app.voxiplan.com/voxisms) in your VoxiPlan dashboard.',
		},
		{
			// Labeled "Token" (not "Secret Key") to match the wording in the VoxiPlan
			// dashboard and the VoxiSMS Android app. Masked in the UI via password option.
			displayName: 'Legacy Token',
			name: 'secretKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			displayOptions: { show: { apiKey: [''] } },
			description:
				'Copy the token shown under "Activate your token" on the "Link your phone" page (https://app.voxiplan.com/voxisms) in your VoxiPlan dashboard. It is the same token you paste from the VoxiSMS Android app during setup.',
		},
	];

	// Group keys use Bearer; existing saved credentials retain per-request HMAC.
	authenticate: IAuthenticate = async (
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> => {
		const url = new URL(/^https?:\/\//i.test(requestOptions.url)
			? requestOptions.url
			: `${requestOptions.baseURL?.replace(/\/$/, '') ?? ''}/${requestOptions.url.replace(/^\/+/, '')}`);
		// n8n can reuse these credentials in its generic HTTP node. Never sign or send
		// a key to an arbitrary origin, including a redirect from the API.
		if (url.origin !== 'https://api.voxisms.com' || !url.pathname.startsWith('/v2/') || url.username || url.password) {
			throw new Error('VoxiSMS credentials can only be used with https://api.voxisms.com/v2/');
		}
		// Send the exact URL we validated; protocol-relative input must not be
		// interpreted differently later by the HTTP client.
		requestOptions.url = url.href;
		delete requestOptions.baseURL;
		requestOptions.disableFollowRedirect = true;
		for (const header of Object.keys(requestOptions.headers ?? {})) {
			if (['authorization', 'customer-id', 'device-id', 'pool-id', 'timestamp', 'signature'].includes(header.toLowerCase())) {
				delete requestOptions.headers![header];
			}
		}
		const apiKey = String(credentials.apiKey ?? '').trim();
		if (apiKey) {
			requestOptions.headers = { ...requestOptions.headers, Authorization: `Bearer ${apiKey}` };
			return requestOptions;
		}
		if (!credentials.customerId || !credentials.secretKey) {
			throw new Error('Enter a group API key or your existing Customer ID and Token');
		}

		requestOptions.headers = {
			...requestOptions.headers,
			...buildSignedHeaders({
				method: requestOptions.method ?? 'GET',
				path: signedPath(url.href),
				// Normalize ONCE so the signed canonical and the customer-id header cannot disagree.
				customerId: normalizeCustomerId((credentials.customerId as string) ?? ''),
				secretKey: (credentials.secretKey as string) ?? '',
				bodyString: bodyToSign(requestOptions.body),
			}),
		};

		return requestOptions;
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: BASE_URL,
			url: STATUS_PATH,
			method: 'GET',
		},
	};
}
