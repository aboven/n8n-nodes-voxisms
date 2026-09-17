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

// API Gateway strips the `/v2` base path before the Lambda signs, so the signed path is
// the route without it.
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

	// Points at the VoxiPlan dashboard page where users find both fields below.
	documentationUrl = 'https://app.voxiplan.com/voxisms';

	properties: INodeProperties[] = [
		{
			// The customer identifier is the registered phone number. We normalize away a
			// pasted leading "+" / spaces at sign time (normalizeCustomerId), but ask users
			// to enter it without the "+" to match what they see in the dashboard.
			displayName: 'Customer ID',
			name: 'customerId',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. 33639980000',
			description:
				'Enter the phone number you registered, without the leading "+" (e.g. 33639980000). You can find it under "Register your number" on the "Link your phone" page (https://app.voxiplan.com/voxisms) in your VoxiPlan dashboard.',
		},
		{
			// Labeled "Token" (not "Secret Key") to match the wording in the VoxiPlan
			// dashboard and the VoxiSMS Android app. Masked in the UI via password option.
			displayName: 'Token',
			name: 'secretKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Copy the token shown under "Activate your token" on the "Link your phone" page (https://app.voxiplan.com/voxisms) in your VoxiPlan dashboard. It is the same token you paste from the VoxiSMS Android app during setup.',
		},
	];

	// Per-user HMAC (VoxiSMS v2): there is no shared api-key, and neither field below is
	// ever sent in the body. The signature covers method, route, timestamp, customer id and
	// the exact body bytes, so it is computed per request rather than as a static header.
	authenticate: IAuthenticate = async (
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> => {
		const url = requestOptions.baseURL
			? `${requestOptions.baseURL.replace(/\/$/, '')}${requestOptions.url}`
			: requestOptions.url;

		requestOptions.headers = {
			...requestOptions.headers,
			...buildSignedHeaders({
				method: requestOptions.method ?? 'GET',
				path: signedPath(url),
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
