import type { IHttpRequestOptions } from 'n8n-workflow';

const API_ORIGIN = 'https://api.voxisms.com';

const AUTH_HEADERS = ['authorization', 'customer-id', 'device-id', 'pool-id', 'timestamp', 'signature'];

// n8n can reuse VoxiSMS credentials in its generic HTTP node. Never sign or send a key to
// an arbitrary origin, including a redirect from the API. Returns the validated URL.
export function restrictToVoxiSmsApi(requestOptions: IHttpRequestOptions): URL {
	const url = new URL(/^https?:\/\//i.test(requestOptions.url)
		? requestOptions.url
		: `${requestOptions.baseURL?.replace(/\/$/, '') ?? ''}/${requestOptions.url.replace(/^\/+/, '')}`);
	if (url.origin !== API_ORIGIN || !url.pathname.startsWith('/v2/') || url.username || url.password) {
		throw new Error('VoxiSMS credentials can only be used with https://api.voxisms.com/v2/');
	}
	// Send the exact URL we validated; protocol-relative input must not be
	// interpreted differently later by the HTTP client.
	requestOptions.url = url.href;
	delete requestOptions.baseURL;
	requestOptions.disableFollowRedirect = true;
	for (const header of Object.keys(requestOptions.headers ?? {})) {
		if (AUTH_HEADERS.includes(header.toLowerCase())) {
			delete requestOptions.headers![header];
		}
	}
	return url;
}
