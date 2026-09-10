import {
	buildSignedHeaders,
	normalizeCustomerId,
	ENQUEUE_PATH,
	STATUS_PATH,
} from '../nodes/shared/signing';

describe('buildSignedHeaders', () => {
	// Committed vector — locks the canonical-string format to the Rust signer.
	// Reproduce with:
	//   printf '%s\n%s\n%s\n%s\n%s' POST /enqueue-message 1700000000 33612345678 '<body>' \
	//     | openssl dgst -sha256 -hmac 'test-secret-key'
	it('matches the committed HMAC vector for a POST body', () => {
		const bodyString =
			'{"id":"fixed-uuid-1234","recipient":"+15551234567","message":"Hello, world!","webhookUrl":"https://app.voxiplan.com/webhooks/sms/events","source":"zapier"}';

		const headers = buildSignedHeaders({
			method: 'POST',
			path: ENQUEUE_PATH,
			customerId: '33612345678',
			secretKey: 'test-secret-key',
			bodyString,
			timestamp: '1700000000',
		});

		expect(headers.signature).toBe(
			'd59bbf2dda7b7527aebbae9188d4a6ce7882b5800f093f451c516ed3ea74540f',
		);
		expect(headers.signature).toMatch(/^[0-9a-f]{64}$/);
		expect(headers['customer-id']).toBe('33612345678');
		expect(headers.timestamp).toBe('1700000000');
	});

	// Empty-body GET → canonical ends in a trailing '\n' (matches the server's body: b"").
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
		expect(normalizeCustomerId('+33 612 345 678')).toBe('33612345678');
	});

	it('passes an already-clean id through untouched', () => {
		expect(normalizeCustomerId('33612345678')).toBe('33612345678');
	});
});
