import type { ICredentialDataDecryptedObject, IHttpRequestOptions } from 'n8n-workflow';

import { VoxiSmsApi } from '../credentials/VoxiSmsApi.credentials';
import { buildSignedHeaders, ENQUEUE_PATH, STATUS_PATH } from '../nodes/shared/signing';

const credentials = {
	customerId: '+33 612345678',
	secretKey: 'test-secret-key',
} as unknown as ICredentialDataDecryptedObject;

const authenticate = new VoxiSmsApi().authenticate as (
	credentials: ICredentialDataDecryptedObject,
	requestOptions: IHttpRequestOptions,
) => Promise<IHttpRequestOptions>;

const sign = (options: IHttpRequestOptions) => authenticate(credentials, options);

describe('VoxiSmsApi.authenticate', () => {
	// The signed path is the route without the `/v2` base path API Gateway strips.
	it('signs the base-path-stripped route, not the URL path', async () => {
		const bodyString = '{"id":"fixed","recipient":"+15551234567","message":"hi","source":"n8n"}';

		const signed = await sign({
			method: 'POST',
			url: 'https://api.voxisms.com/v2/enqueue-message',
			body: bodyString,
			json: false,
		});

		const expected = buildSignedHeaders({
			method: 'POST',
			path: ENQUEUE_PATH,
			customerId: '33612345678',
			secretKey: 'test-secret-key',
			bodyString,
			timestamp: signed.headers!.timestamp as string,
		});
		expect(signed.headers!.signature).toBe(expected.signature);
	});

	it('normalizes a pasted "+" and spaces out of the customer id', async () => {
		const signed = await sign({ method: 'GET', url: 'https://api.voxisms.com/v2/user/status' });
		expect(signed.headers!['customer-id']).toBe('33612345678');
	});

	// The credential test passes the route via baseURL rather than an absolute URL.
	it('joins baseURL and url before deriving the signed path', async () => {
		const signed = await sign({
			method: 'GET',
			baseURL: 'https://api.voxisms.com/v2',
			url: STATUS_PATH,
		});

		const expected = buildSignedHeaders({
			method: 'GET',
			path: STATUS_PATH,
			customerId: '33612345678',
			secretKey: 'test-secret-key',
			timestamp: signed.headers!.timestamp as string,
		});
		expect(signed.headers!.signature).toBe(expected.signature);
	});

	// The DELETE route is dynamic; the subscription id is part of the signed path.
	it('signs the subscription id in a dynamic DELETE path', async () => {
		const signed = await sign({
			method: 'DELETE',
			url: 'https://api.voxisms.com/v2/webhook-subscriptions/sub-123',
		});

		const expected = buildSignedHeaders({
			method: 'DELETE',
			path: '/webhook-subscriptions/sub-123',
			customerId: '33612345678',
			secretKey: 'test-secret-key',
			timestamp: signed.headers!.timestamp as string,
		});
		expect(signed.headers!.signature).toBe(expected.signature);
	});

	// An object body is serialized once here; a string body must reach the wire untouched.
	it('signs a string body verbatim and preserves existing headers', async () => {
		const bodyString = '{"a":1,"b":2}';
		const signed = await sign({
			method: 'POST',
			url: 'https://api.voxisms.com/v2/webhook-subscriptions',
			headers: { 'Content-Type': 'application/json' },
			body: bodyString,
			json: false,
		});

		expect(signed.body).toBe(bodyString);
		expect(signed.headers!['Content-Type']).toBe('application/json');
	});

	it('signs an absent body as the empty string', async () => {
		const signed = await sign({ method: 'GET', url: 'https://api.voxisms.com/v2/user/status' });
		const expected = buildSignedHeaders({
			method: 'GET',
			path: STATUS_PATH,
			customerId: '33612345678',
			secretKey: 'test-secret-key',
			bodyString: '',
			timestamp: signed.headers!.timestamp as string,
		});
		expect(signed.headers!.signature).toBe(expected.signature);
	});
});
