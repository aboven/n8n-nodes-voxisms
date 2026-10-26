import {
	buildSignedHeaders,
	normalizeCustomerId,
	ENQUEUE_PATH,
	STATUS_PATH,
} from '../nodes/shared/signing';

describe('buildSignedHeaders', () => {
	// Committed vector locks the public canonical-string format.
	// Reproduce with:
	//   printf '%s\n%s\n%s\n%s\n%s' POST /enqueue-message 1700000000 12025550101 '<body>' \
	//     | openssl dgst -sha256 -hmac 'test-secret-key'
	it('matches the committed HMAC vector for a POST body', () => {
		const bodyString =
			'{"id":"fixed-uuid-1234","recipient":"+12025550102","message":"Hello, world!","webhookUrl":"https://example.com/webhooks/sms/events","source":"n8n"}';

		const headers = buildSignedHeaders({
			method: 'POST',
			path: ENQUEUE_PATH,
			customerId: '12025550101',
			secretKey: 'test-secret-key',
			bodyString,
			timestamp: '1700000000',
		});

		expect(headers.signature).toBe(
			'14b8a444c28e7bcc27c3291a3ab736e827f0df764cd61d5c4f33543034e03fee',
		);
		expect(headers.signature).toMatch(/^[0-9a-f]{64}$/);
		expect(headers['customer-id']).toBe('12025550101');
		expect(headers.timestamp).toBe('1700000000');
	});

	// Empty-body GET: the canonical string ends in a trailing '\n'.
	//   printf '%s\n%s\n%s\n%s\n%s' GET /user/status 1751414400 cust-demo '' \
	//     | openssl dgst -sha256 -hmac 'supersecret'
	it('signs an empty body for the status GET', () => {
		const headers = buildSignedHeaders({
			method: 'GET',
			path: STATUS_PATH,
			customerId: 'cust-demo',
			secretKey: 'supersecret',
			timestamp: '1751414400',
		});

		expect(headers.signature).toBe(
			'38028105fa321d65703dc1795a3b1174dbd6994a29d2ffde10404c5ca0b04849',
		);
	});

	it('defaults the timestamp to current unix seconds', () => {
		const before = Math.floor(Date.now() / 1000);
		const headers = buildSignedHeaders({
			method: 'GET',
			path: STATUS_PATH,
			customerId: 'c',
			secretKey: 'k',
		});
		const after = Math.floor(Date.now() / 1000);
		const ts = Number(headers.timestamp);

		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
	});
});

describe('normalizeCustomerId', () => {
	it('strips a leading "+" and whitespace', () => {
		expect(normalizeCustomerId('+1 202 555 0101')).toBe('12025550101');
	});

	it('passes an already-clean id through untouched', () => {
		expect(normalizeCustomerId('12025550101')).toBe('12025550101');
	});
});
