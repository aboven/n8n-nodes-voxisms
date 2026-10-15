import { NodeApiError } from 'n8n-workflow';
import { VoxiSmsTrigger } from '../nodes/VoxiSmsTrigger/VoxiSmsTrigger.node';
const hooks = new VoxiSmsTrigger().webhookMethods.default;
function context(saved: Record<string, unknown>, apiKey = 'key') {
	return {
		getWorkflowStaticData: () => saved,
		getCredentials: async () => apiKey ? { apiKey } : { customerId: 'old', secretKey: 'old' },
		getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/test',
		getNode: () => ({ name: 'VoxiSMS Trigger', type: 'voxiSmsTrigger' }),
		logger: { warn: jest.fn() },
		helpers: { httpRequestWithAuthentication: jest.fn().mockResolvedValue({ statusCode: 200, body: { subscriptionId: 's', signingSecret: 'secret' } }) },
	};
}
it('re-registers group access on every activation without a separate status check', async () => {
	const saved = { subscriptionId: 's', signingSecret: 'secret', usesApiKey: true };
	const ctx = context(saved);
	await expect(hooks.checkExists.call(ctx as never)).resolves.toBe(false);
	expect(ctx.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	await expect(hooks.create.call(ctx as never)).resolves.toBe(true);
	expect(saved).toEqual({ subscriptionId: 's', signingSecret: 'secret', usesApiKey: true });
	expect(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({ method: 'POST', url: 'https://api.voxisms.com/v2/webhook-subscriptions' });
});
it('preserves an existing legacy subscription with no new saved fields', async () => {
	const ctx = context({ subscriptionId: 's' }, '');
	await expect(hooks.checkExists.call(ctx as never)).resolves.toBe(true);
	expect(ctx.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
});
it.each(['legacy-to-group', 'group-to-legacy'])('registers a changed authentication mode: %s', async (direction) => {
	const apiKey = direction === 'legacy-to-group' ? 'key' : '';
	const saved = { subscriptionId: 'old', signingSecret: 'old-secret', usesApiKey: !apiKey };
	const ctx = context(saved, apiKey);
	await expect(hooks.checkExists.call(ctx as never)).resolves.toBe(false);
	await hooks.create.call(ctx as never);
	expect(saved).toEqual({ subscriptionId: 's', signingSecret: 'secret', usesApiKey: Boolean(apiKey) });
});
it.each([401, 403, 503])('fails activation without changing saved state on HTTP %s', async (statusCode) => {
	const saved = { subscriptionId: 'old', signingSecret: 'old-secret', usesApiKey: true };
	const ctx = context(saved);
	ctx.helpers.httpRequestWithAuthentication.mockResolvedValue({ statusCode, body: { error: 'Unavailable' } });
	await expect(hooks.create.call(ctx as never)).rejects.toThrow();
	expect(saved).toEqual({ subscriptionId: 'old', signingSecret: 'old-secret', usesApiKey: true });
});
it.each([{ subscriptionId: 'new' }, { subscriptionId: 123, signingSecret: 'new' }, { subscriptionId: 'new', signingSecret: ' ' }, null])('does not partially overwrite state on malformed response %p', async (body) => {
	const saved = { subscriptionId: 'old', signingSecret: 'old-secret', usesApiKey: true };
	const ctx = context(saved);
	ctx.helpers.httpRequestWithAuthentication.mockResolvedValue({ statusCode: 200, body });
	await expect(hooks.create.call(ctx as never)).rejects.toThrow('did not return');
	expect(saved).toEqual({ subscriptionId: 'old', signingSecret: 'old-secret', usesApiKey: true });
});
it('does not expose transport request headers when activation fails', async () => {
	const saved = { subscriptionId: 'old', signingSecret: 'old-secret' };
	const ctx = context(saved);
	ctx.helpers.httpRequestWithAuthentication.mockRejectedValue({ message: 'private marker', request: { headers: { Authorization: 'Bearer private marker' } }, response: { status: 503 } });
	try { await hooks.create.call(ctx as never); throw new Error('Expected failure'); } catch (error) {
		expect(JSON.stringify(error)).not.toContain('private marker');
		expect((error as { errorResponse: unknown }).errorResponse).not.toHaveProperty('request');
		expect((error as { httpCode: string }).httpCode).toBe('503');
	}
	expect(saved).toEqual({ subscriptionId: 'old', signingSecret: 'old-secret' });
});
it.each([401, 403, 404])('clears local state when deactivating revoked or absent access: %s', async (statusCode) => {
	const saved = { subscriptionId: 's', signingSecret: 'secret', usesApiKey: true };
	const ctx = context(saved);
	ctx.helpers.httpRequestWithAuthentication.mockResolvedValue({ statusCode });
	await expect(hooks.delete.call(ctx as never)).resolves.toBe(true);
	expect(saved).toEqual({});
});

it('sanitizes a wrapped HTTP-client error during activation', async () => {
	const ctx = context({ subscriptionId: 'old', signingSecret: 'old-secret' });
	const wrapped = new NodeApiError(ctx.getNode() as never, { request: { headers: { Authorization: 'Bearer private marker' } } }, { message: 'private marker', httpCode: '503' });
	ctx.helpers.httpRequestWithAuthentication.mockRejectedValue(wrapped);
	try { await hooks.create.call(ctx as never); throw new Error('Expected failure'); } catch (error) {
		expect(error).not.toBe(wrapped);
		expect(JSON.stringify(error)).not.toContain('private marker');
		expect((error as { errorResponse: unknown }).errorResponse).not.toHaveProperty('request');
	}
});
