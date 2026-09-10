import { createHmac, timingSafeEqual } from 'crypto';

// Max allowed clock skew (seconds) between the delivery's signed timestamp and our own
// clock. Matches the server's replay window documented in the callback spec (±300s).
const MAX_SKEW_SECONDS = 300;

// Shape of a verifier outcome. A discriminated union so the caller can narrow on `ok`
// and switch on `reason` for the throw-vs-drop decision.
export type VerifyResult =
	| { ok: true }
	| { ok: false; reason: 'missing' | 'unverifiable' | 'invalid' | 'skew' };

export interface VerifySignatureParams {
	signingSecret: string;
	// `unknown` on purpose: at the webhook boundary the raw body may not be a string (or may
	// be absent). The `typeof rawBody !== 'string'` guard below is what enforces the contract.
	rawBody: unknown;
	// Likewise header values can be a string, a multi-value array, or undefined depending on
	// the transport, so accept the widest type and narrow inside.
	signatureHeader: unknown;
	timestampHeader: unknown;
	now?: number;
}

// Pure, n8n-free verifier for an inbound event delivery — mirrors how `signing.ts` keeps
// the crypto separate from the node plumbing so it can be unit-tested in isolation.
//
// Per the `inboundMessageReceived` callback contract, each delivery is signed as:
//   expected = HMAC_SHA256(signingSecret, `${timestamp}.${rawBody}`)  (lowercase hex)
// and delivered in the `X-VoxiSMS-Signature` header with a `sha256=` prefix, alongside the
// signed `X-VoxiSMS-Timestamp` (Unix seconds). `rawBody` MUST be the exact raw request
// bytes — never a re-serialized parse — or key reordering/whitespace breaks the digest.
//
// Returns a plain result object rather than throwing, so the caller decides how each
// outcome maps onto the node's throw-vs-drop policy:
//   { ok: true }                            — signature valid and timestamp fresh
//   { ok: false, reason: 'missing' }        — no (usable) signature header / no timestamp
//                                             (unsigned noise → caller drops)
//   { ok: false, reason: 'unverifiable' }   — signature present but there are no raw bytes
//                                             to check it against (→ caller surfaces)
//   { ok: false, reason: 'invalid' }        — signature present but does not match
//                                             (secret/config drift → caller surfaces)
//   { ok: false, reason: 'skew' }           — signature valid but timestamp out of window
//                                             (replay / clock drift → caller surfaces)
export const verifySignature = ({
	signingSecret,
	rawBody,
	signatureHeader,
	timestampHeader,
	now = Math.floor(Date.now() / 1000),
}: VerifySignatureParams): VerifyResult => {
	// A non-string header (e.g. a multi-value array) is unusable — treat as unsigned noise,
	// same as a fully absent header. Guarding here keeps the `.startsWith`/length ops below
	// from throwing on a non-string.
	if (typeof signatureHeader !== 'string' || !signatureHeader || !timestampHeader) {
		return { ok: false, reason: 'missing' };
	}

	// Signature IS present but we have no raw bytes to verify it against. We can't clear it,
	// and a present-but-unverifiable signature must not be silently dropped — surface it.
	if (typeof rawBody !== 'string') {
		return { ok: false, reason: 'unverifiable' };
	}

	// `timestampHeader` is truthy here, but may still be a non-string (e.g. array); coerce to
	// a string so it is safe to interpolate into the canonical and to `Number()` below.
	const timestampString = String(timestampHeader);

	// Strip the `sha256=` prefix the header carries (tolerate its absence defensively) and
	// lowercase it — the expected digest is lowercase hex, so an uppercase-but-correct digest
	// should still compare equal.
	const provided = (
		signatureHeader.startsWith('sha256=')
			? signatureHeader.slice('sha256='.length)
			: signatureHeader
	).toLowerCase();

	const expected = createHmac('sha256', signingSecret)
		.update(`${timestampString}.${rawBody}`, 'utf8')
		.digest('hex');

	// Constant-time compare. timingSafeEqual throws on length mismatch, so guard lengths
	// first — a wrong length is, itself, a non-match (present but invalid).
	const providedBuf = Buffer.from(provided, 'utf8');
	const expectedBuf = Buffer.from(expected, 'utf8');
	if (
		providedBuf.length !== expectedBuf.length ||
		!timingSafeEqual(providedBuf, expectedBuf)
	) {
		return { ok: false, reason: 'invalid' };
	}

	// Signature is authentic; enforce the replay window on the (now trusted) timestamp.
	const ts = Number(timestampString);
	if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_SECONDS) {
		return { ok: false, reason: 'skew' };
	}

	return { ok: true };
};

export { MAX_SKEW_SECONDS };
