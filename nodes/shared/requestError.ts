import { NodeApiError, type INode } from 'n8n-workflow';

// HTTP clients may attach credentials to their errors. Keep only the status.
export function requestError(node: INode, error: unknown, itemIndex?: number) {
	const response = error as { statusCode?: unknown; httpCode?: unknown; response?: { status?: unknown } } | null;
	const status = response?.statusCode ?? response?.response?.status ?? Number(response?.httpCode);
	const httpCode = typeof status === 'number' && status >= 100 && status <= 599 ? String(status) : undefined;
	return new NodeApiError(node, { message: 'Could not reach VoxiSMS' }, {
		message: 'Could not reach VoxiSMS',
		description: 'Check the connection and try again.', httpCode, itemIndex,
	});
}
