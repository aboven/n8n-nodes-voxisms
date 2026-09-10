import type { ICredentialType, INodeProperties } from 'n8n-workflow';

// VoxiSMS credential definition.
//
// Auth is per-user HMAC (VoxiSMS v2): every request is signed with the user's secret
// token — there is NO shared api-key, and neither `customerId` nor `secretKey` is ever
// sent in the request body. The three signed headers (customer-id, timestamp, signature)
// are built per-request by `buildSignedHeaders` in `nodes/shared/signing.ts`.
//
// We deliberately do NOT declare a generic `authenticate` block here. n8n's generic auth
// can only inject static headers/query params; our signature depends on the HTTP method,
// the base-path-stripped route, a fresh timestamp, AND the exact request-body bytes. That
// is request-specific, so signing happens inside each node (the Send node and the
// connection test) where those values are known — never as a one-size-fits-all header.
export class VoxiSmsApi implements ICredentialType {
	name = 'voxiSmsApi';

	displayName = 'VoxiSMS API';

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
			placeholder: '33639980000',
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
				'Copy the token shown under "Activate your token" on the "Link your phone" page (https://app.voxiplan.com/voxisms) in your VoxiPlan dashboard — it\'s the same token you paste from the VoxiSMS Android app during setup.',
		},
	];
}
