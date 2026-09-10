import { createHmac } from 'crypto';
import { verifySignature } from '../nodes/shared/verifySignature';

// Signs `${ts}.${rawBody}` the way VoxiSMS does for a delivery, and wraps it with the
// `sha256=` prefix the header carries.
const sign = (secret: string, ts: string, rawBody: string): string =>
	'sha256=' +
	createHmac('sha256', secret).update(`${ts}.${rawBody}`, 'utf8').digest('hex');

describe('verifySignature', () => {
	const secret = 'signing-secret-abc';
	const rawBody = '{"eventId":"evt_1","content":"hi"}';
	const now = 1_752_583_338;
	const ts = String(now);

	it('accepts a valid signature within the freshness window', () => {
		const result = verifySignature({
			signingSecret: secret,
			rawBody,
			signatureHeader: sign(secret, ts, rawBody),
			timestampHeader: ts,
			now,
		});
		expect(result).toEqual({ ok: true });
	});

	it('tolerates a signature header without the sha256= prefix', () => {
		const bare = createHmac('sha256', secret)
			.update(`${ts}.${rawBody}`, 'utf8')
			.digest('hex');
		const result = verifySignature({
			signingSecret: secret,
			rawBody,
			signatureHeader: bare,
			timestampHeader: ts,
			now,
		});
		expect(result.ok).toBe(true);
	});

	it('flags a present-but-wrong signature as invalid', () => {
		const result = verifySignature({
			signingSecret: secret,
			rawBody,
			signatureHeader: sign('the-wrong-secret', ts, rawBody),
			timestampHeader: ts,
			now,
		});
		expect(result).toEqual({ ok: false, reason: 'invalid' });
	});

	it('flags a tampered body as invalid', () => {
		const result = verifySignature({
			signingSecret: secret,
			rawBody: rawBody + ' ',
			signatureHeader: sign(secret, ts, rawBody),
			timestampHeader: ts,
			now,
		});
		expect(result).toEqual({ ok: false, reason: 'invalid' });
	});

	it('flags a valid signature over a skewed timestamp as skew', () => {
		const oldTs = String(now - 3600);
		const result = verifySignature({
			signingSecret: secret,
			rawBody,
			signatureHeader: sign(secret, oldTs, rawBody),
			timestampHeader: oldTs,
			now,
		});
		expect(result).toEqual({ ok: false, reason: 'skew' });
	});

	it('reports missing when the signature header is absent', () => {
		const result = verifySignature({
			signingSecret: secret,
			rawBody,
			signatureHeader: undefined,
			timestampHeader: ts,
			now,
		});
		expect(result).toEqual({ ok: false, reason: 'missing' });
	});

	it('reports unverifiable when the signature is present but the raw body is not a string', () => {
		const result = verifySignature({
			signingSecret: secret,
			rawBody: undefined,
			signatureHeader: sign(secret, ts, rawBody),
			timestampHeader: ts,
			now,
		});
		expect(result).toEqual({ ok: false, reason: 'unverifiable' });
	});

	it('accepts an uppercase-but-correct hex digest', () => {
		const hexUpper = createHmac('sha256', secret)
			.update(`${ts}.${rawBody}`, 'utf8')
			.digest('hex')
			.toUpperCase();
		const result = verifySignature({
			signingSecret: secret,
			rawBody,
			signatureHeader: `sha256=${hexUpper}`,
			timestampHeader: ts,
			now,
		});
		expect(result.ok).toBe(true);
	});

	it('treats a non-string (multi-value array) signature header as missing', () => {
		const sig = sign(secret, ts, rawBody);
		const result = verifySignature({
			signingSecret: secret,
			rawBody,
			signatureHeader: [sig, sig],
			timestampHeader: ts,
			now,
		});
		expect(result).toEqual({ ok: false, reason: 'missing' });
	});
});
