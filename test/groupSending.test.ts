import { NodeApiError } from 'n8n-workflow';
import { VoxiSms } from '../nodes/VoxiSms/VoxiSms.node';

function context(credentials: Record<string, string>, replyToMessageId = '') {
	const request = jest.fn().mockResolvedValue({ statusCode: 202, body: { messageId: 'outbound', status: 'accepted' } });
	const params: Record<string, string> = { resource: 'sms', operation: 'send', recipient: '+32470123456', message: '你好 😀', id: 'reference', replyToMessageId };
	return { request, ctx: {
		getInputData: () => [{ json: {} }], getCredentials: async () => credentials,
		getNodeParameter: (key: string) => params[key], getNode: () => ({ name: 'VoxiSMS', type: 'voxiSms' }),
		helpers: { httpRequestWithAuthentication: request }, continueOnFail: () => false,
	} };
}

describe('sending contracts', () => {
	it('keeps legacy saved credentials and payloads working', async () => {
		const { ctx, request } = context({ customerId: '3247', secretKey: 'old' });
		await new VoxiSms().execute.call(ctx as never);
		const options = request.mock.calls[0][1];
		expect(options.url).toBe('https://api.voxisms.com/v2/enqueue-message');
		expect(JSON.parse(options.body)).toEqual({ id: 'reference', recipient: '+32470123456', message: '你好 😀', source: 'n8n' });
	});
	it('uses the exact incoming reference for group replies without transport fields', async () => {
		const { ctx, request } = context({ apiKey: 'key' }, 'incoming-uuid');
		await new VoxiSms().execute.call(ctx as never);
		const options = request.mock.calls[0][1];
		expect(options.url).toBe('https://api.voxisms.com/v2/messages');
		expect(JSON.parse(options.body)).toEqual({ id: 'reference', to: '+32470123456', message: '你好 😀', replyToMessageId: 'incoming-uuid' });
	});
	it('rejects a same-phone reply request using legacy credentials before sending', async () => {
		const { ctx, request } = context({ customerId: '3247', secretKey: 'old' }, 'incoming-uuid');
		await expect(new VoxiSms().execute.call(ctx as never)).rejects.toThrow('requires a phone-group API key');
		expect(request).not.toHaveBeenCalled();
	});
});

it('keeps raw request data out of network errors', async () => {
	const { ctx, request } = context({ apiKey: 'key' });
	request.mockRejectedValue({ message: 'private marker', config: { headers: { Authorization: 'Bearer private marker' } } });
	try { await new VoxiSms().execute.call(ctx as never); throw new Error('Expected failure'); } catch (error) {
		expect(JSON.stringify(error)).not.toContain('private marker');
		expect((error as { errorResponse: unknown }).errorResponse).not.toHaveProperty('config');
	}
});

it('sanitizes already-wrapped transport errors before exposing them', async () => {
	const { ctx, request } = context({ apiKey: 'key' });
	const wrapped = new NodeApiError(ctx.getNode() as never, { request: { headers: { Authorization: 'Bearer private marker' } } }, { message: 'private marker', httpCode: '503' });
	request.mockRejectedValue(wrapped);
	try { await new VoxiSms().execute.call(ctx as never); throw new Error('Expected failure'); } catch (error) {
		expect(error).not.toBe(wrapped);
		expect(JSON.stringify(error)).not.toContain('private marker');
		expect((error as { errorResponse: unknown }).errorResponse).not.toHaveProperty('request');
		expect((error as { httpCode: string }).httpCode).toBe('503');
	}
});
