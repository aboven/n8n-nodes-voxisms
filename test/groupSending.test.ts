import { NodeApiError } from 'n8n-workflow';
import { VoxiSms } from '../nodes/VoxiSms/VoxiSms.node';

function context(
	typeVersion: number,
	replyToMessageId = '',
	body: Record<string, unknown> = { messageId: 'outbound', status: 'accepted' },
	statusCode = 202,
	// The version 2 Authentication selector. Omitted means its default (API key).
	authMethod?: string,
) {
	const request = jest.fn().mockResolvedValue({ statusCode, body });
	const getCredentials = jest.fn();
	const params: Record<string, string> = { resource: 'sms', operation: 'send', recipient: '+32470123456', message: '你好 😀', id: 'reference', replyToMessageId };
	if (authMethod !== undefined) params.authMethod = authMethod;
	const getNodeParameter = jest.fn((key: string, _item: number, fallback?: unknown) => params[key] ?? fallback);
	return { request, getCredentials, getNodeParameter, ctx: {
		getInputData: () => [{ json: {} }], getCredentials, getNodeParameter,
		getNode: () => ({ name: 'VoxiSMS', type: 'voxiSms', typeVersion }),
		helpers: { httpRequestWithAuthentication: request }, continueOnFail: () => false,
	} };
}

describe('version 1 (legacy credential)', () => {
	it('keeps legacy saved credentials and payloads working', async () => {
		const { ctx, request } = context(1, '', { messageId: 'outbound' });
		const result = await new VoxiSms().execute.call(ctx as never);
		expect(request.mock.calls[0][0]).toBe('voxiSmsApi');
		const options = request.mock.calls[0][1];
		expect(options.url).toBe('https://api.voxisms.com/v2/enqueue-message');
		expect(JSON.parse(options.body)).toEqual({ id: 'reference', recipient: '+32470123456', message: '你好 😀', source: 'n8n' });
		expect(result[0][0].json).toEqual({ messageId: 'outbound' });
	});
	it.each(['object', 'JSON string'])('preserves the complete successful %s response for saved workflows', async (format) => {
		const body = { messageId: 'outbound', extra: 'workflow-data' };
		const { ctx, request } = context(1, '', body);
		if (format === 'JSON string') request.mockResolvedValue({ statusCode: 200, body: JSON.stringify(body) });
		const result = await new VoxiSms().execute.call(ctx as never);
		expect(result[0][0]).toEqual({ json: body, pairedItem: { item: 0 } });
	});
	it('ignores a reply reference that version 1 does not show', async () => {
		const { ctx, request } = context(1, 'incoming-uuid');
		await new VoxiSms().execute.call(ctx as never);
		expect(JSON.parse(request.mock.calls[0][1].body)).not.toHaveProperty('replyToMessageId');
		expect(request.mock.calls[0][1].url).toBe('https://api.voxisms.com/v2/enqueue-message');
	});
	it.each([401, 403])('points to the legacy credential for HTTP %s', async (statusCode) => {
		const { ctx } = context(1, '', { error: 'Rejected' }, statusCode);
		await expect(new VoxiSms().execute.call(ctx as never)).rejects.toMatchObject({
			message: 'VoxiSMS did not accept the credentials on this request',
			description: expect.stringContaining('VoxiSMS Legacy API'),
		});
	});
	it('stays on the legacy credential even if an Authentication value is present', async () => {
		const { ctx, request, getNodeParameter } = context(1, '', undefined, undefined, 'apiKey');
		await new VoxiSms().execute.call(ctx as never);
		expect(request.mock.calls[0][0]).toBe('voxiSmsApi');
		expect(request.mock.calls[0][1].url).toBe('https://api.voxisms.com/v2/enqueue-message');
		expect(getNodeParameter).not.toHaveBeenCalledWith('authMethod', expect.anything(), expect.anything());
	});
});

describe('version 2 with legacy authentication', () => {
	it('keeps the legacy credential, route, payload and output', async () => {
		const { ctx, request, getCredentials } = context(2, '', { messageId: 'outbound', status: 'accepted' }, 202, 'legacy');
		const result = await new VoxiSms().execute.call(ctx as never);
		expect(request.mock.calls[0][0]).toBe('voxiSmsApi');
		const options = request.mock.calls[0][1];
		expect(options).toMatchObject({ method: 'POST', url: 'https://api.voxisms.com/v2/enqueue-message', json: false });
		// The legacy credential signs these exact bytes.
		expect(options.body).toBe('{"id":"reference","recipient":"+32470123456","message":"你好 😀","source":"n8n"}');
		expect(result[0][0].json).toEqual({ messageId: 'outbound' });
		expect(getCredentials).not.toHaveBeenCalled();
	});
	it('does not send a reply reference', async () => {
		const { ctx, request, getNodeParameter } = context(2, 'incoming-uuid', undefined, undefined, 'legacy');
		await new VoxiSms().execute.call(ctx as never);
		expect(JSON.parse(request.mock.calls[0][1].body)).not.toHaveProperty('replyToMessageId');
		expect(getNodeParameter).not.toHaveBeenCalledWith('replyToMessageId', expect.anything(), expect.anything());
	});
	it.each([401, 403])('points to the legacy credential for HTTP %s', async (statusCode) => {
		const { ctx } = context(2, '', { error: 'Rejected' }, statusCode, 'legacy');
		await expect(new VoxiSms().execute.call(ctx as never)).rejects.toMatchObject({
			message: 'VoxiSMS did not accept the credentials on this request',
			description: expect.stringContaining('VoxiSMS Legacy API'),
		});
	});
});

describe('version 2 (group API key)', () => {
	it.each([
		['by default', undefined],
		['when selected', 'apiKey'],
	])('uses API key authentication %s', async (_label, authMethod) => {
		const { ctx, request } = context(2, '', undefined, undefined, authMethod);
		const result = await new VoxiSms().execute.call(ctx as never);
		expect(request.mock.calls[0][0]).toBe('voxiSmsGroupApi');
		expect(request.mock.calls[0][1].url).toBe('https://api.voxisms.com/v2/messages');
		expect(result[0][0].json).toEqual({ messageId: 'outbound', status: 'accepted' });
	});
	it('rejects an unknown Authentication value without sending', async () => {
		const { ctx, request } = context(2, '', undefined, undefined, 'other');
		await expect(new VoxiSms().execute.call(ctx as never)).rejects.toThrow('Select an Authentication method');
		expect(request).not.toHaveBeenCalled();
	});
	it('sends through the group credential and route', async () => {
		const { ctx, request, getCredentials } = context(2);
		await new VoxiSms().execute.call(ctx as never);
		expect(request.mock.calls[0][0]).toBe('voxiSmsGroupApi');
		const options = request.mock.calls[0][1];
		expect(options.url).toBe('https://api.voxisms.com/v2/messages');
		expect(JSON.parse(options.body)).toEqual({ id: 'reference', to: '+32470123456', message: '你好 😀' });
		// The version, not the credential contents, selects the behavior.
		expect(getCredentials).not.toHaveBeenCalled();
	});
	it('uses the exact incoming reference for group replies without transport fields', async () => {
		const { ctx, request } = context(2, 'incoming-uuid');
		await new VoxiSms().execute.call(ctx as never);
		const options = request.mock.calls[0][1];
		expect(options.url).toBe('https://api.voxisms.com/v2/messages');
		expect(JSON.parse(options.body)).toEqual({ id: 'reference', to: '+32470123456', message: '你好 😀', replyToMessageId: 'incoming-uuid' });
	});
	it('returns only documented group response fields', async () => {
		const { ctx } = context(
			2,
			'',
			{
				messageId: 'outbound',
				status: 'accepted',
				sqsMessageId: 'transport-only',
				internalField: 'not public',
			},
		);
		const result = await new VoxiSms().execute.call(ctx as never);
		expect(result[0][0].json).toEqual({ messageId: 'outbound', status: 'accepted' });
		expect(result[0][0].json).not.toHaveProperty('sqsMessageId');
	});
	it('provides credential guidance for HTTP 401', async () => {
		const { ctx, request } = context(2, '', { error: 'Rejected' }, 401);
		await expect(new VoxiSms().execute.call(ctx as never)).rejects.toMatchObject({
			message: 'VoxiSMS did not accept the credentials on this request',
			description: 'Check the API key in the VoxiSMS API credential.',
		});
		expect(request).toHaveBeenCalledTimes(1);
	});
	it.each([
		[{ error: 'Recipient has opted out' }, 'Recipient has opted out'],
		[{}, 'Sending is not permitted by the subscription, or the recipient has opted out.'],
	])('reports a sending restriction for HTTP 403 (%j)', async (body, message) => {
		const { ctx, request } = context(2, 'incoming-uuid', body, 403);
		try {
			await new VoxiSms().execute.call(ctx as never);
			throw new Error('Expected failure');
		} catch (error) {
			expect(error).toMatchObject({ message, httpCode: '403' });
			expect((error as NodeApiError).description).not.toEqual(expect.stringContaining('credential'));
		}
		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0][1].url).toBe('https://api.voxisms.com/v2/messages');
		expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ id: 'reference', replyToMessageId: 'incoming-uuid' });
	});
	it.each([false, true])('exposes only the public 403 error with Continue On Fail %s', async (continueOnFail) => {
		const { ctx, request } = context(2, '', {
			error: 'Sending is not permitted',
			request: { headers: { Authorization: 'Bearer private marker' } },
			internalField: 'private marker',
		}, 403);
		ctx.continueOnFail = () => continueOnFail;
		if (continueOnFail) {
			expect(await new VoxiSms().execute.call(ctx as never)).toEqual([
				[{ json: { error: 'Sending is not permitted' }, pairedItem: { item: 0 } }],
			]);
		} else {
			try {
				await new VoxiSms().execute.call(ctx as never);
				throw new Error('Expected failure');
			} catch (error) {
				expect(error).toMatchObject({ message: 'Sending is not permitted' });
				expect(JSON.stringify(error)).not.toContain('private marker');
			}
		}
		expect(request).toHaveBeenCalledTimes(1);
	});
});

it.each([
	[1, undefined],
	[2, 'apiKey'],
	[2, 'legacy'],
])('keeps raw request data out of network errors (version %s, %s)', async (typeVersion, authMethod) => {
	const { ctx, request } = context(typeVersion, '', undefined, undefined, authMethod);
	request.mockRejectedValue({ message: 'private marker', config: { headers: { Authorization: 'Bearer private marker' } } });
	try { await new VoxiSms().execute.call(ctx as never); throw new Error('Expected failure'); } catch (error) {
		expect(JSON.stringify(error)).not.toContain('private marker');
		expect((error as { errorResponse: unknown }).errorResponse).not.toHaveProperty('config');
	}
});

it('sanitizes already-wrapped transport errors before exposing them', async () => {
	const { ctx, request } = context(2);
	const wrapped = new NodeApiError(ctx.getNode() as never, { request: { headers: { Authorization: 'Bearer private marker' } } }, { message: 'private marker', httpCode: '503' });
	request.mockRejectedValue(wrapped);
	try { await new VoxiSms().execute.call(ctx as never); throw new Error('Expected failure'); } catch (error) {
		expect(error).not.toBe(wrapped);
		expect(JSON.stringify(error)).not.toContain('private marker');
		expect((error as { errorResponse: unknown }).errorResponse).not.toHaveProperty('request');
		expect((error as { httpCode: string }).httpCode).toBe('503');
	}
});
