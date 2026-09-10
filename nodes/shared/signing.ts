import { createHmac } from 'crypto';

// Base-path-stripped route constants. API Gateway strips the `/v2` prefix, so these
// are the exact paths the Lambda signs — NOT the full URL paths.
export const ENQUEUE_PATH = '/enqueue-message';
export const STATUS_PATH = '/user/status';
// Webhook-subscription collection path. The DELETE route is dynamic
// (`/webhook-subscriptions/{subscriptionId}`); build it inline from this constant.
export const SUBSCRIPTIONS_PATH = '/webhook-subscriptions';

export interface SignedHeadersParams {
	method: string;
	path: string;
	customerId: string;
	secretKey: string;
	bodyString?: string;
	timestamp?: string;
}

// Builds the VoxiSMS HMAC auth headers for a request.
//
// The canonical string signed by the server is:
//   METHOD \n PATH \n TIMESTAMP \n CUSTOMER_ID \n BODY
// keyed by the user's secretKey (raw UTF-8), HMAC-SHA256, lowercase hex.
//
// `bodyString` MUST be the exact bytes sent on the wire. For a body-less GET, leave it
// empty ('') — the trailing '\n' + empty segment matches the server's `body: b""`.
// `timestamp` is injectable for deterministic tests; it must be reused verbatim in both
// the signed canonical and the `timestamp` header.
//
// Content-Type is intentionally NOT returned here (it is not part of the signature); the
// caller adds it when sending a request body.
export const buildSignedHeaders = ({
	method,
	path,
	customerId,
	secretKey,
	bodyString = '',
	timestamp = Math.floor(Date.now() / 1000).toString(),
}: SignedHeadersParams): Record<string, string> => {
	const canonical = [method, path, timestamp, customerId, bodyString].join('\n');
	const signature = createHmac('sha256', secretKey)
		.update(canonical, 'utf8')
		.digest('hex');

	return {
		'customer-id': customerId,
		timestamp,
		signature,
	};
};

// Customer ID is the registered phone number; tolerate a pasted "+" or spaces.
// Normalize ONCE and reuse the same value for both the signed canonical and the
// `customer-id` header, so they cannot disagree.
export const normalizeCustomerId = (customerId: string): string =>
	customerId.replace(/[\s+]/g, '');
