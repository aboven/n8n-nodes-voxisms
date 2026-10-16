import { NodeApiError } from 'n8n-workflow';
import { VoxiSmsTrigger } from '../nodes/VoxiSmsTrigger/VoxiSmsTrigger.node';

const hooks = new VoxiSmsTrigger().webhookMethods.default;
const GROUP_ID_A = '123e4567-e89b-12d3-a456-426614174000';
const GROUP_ID_B = '123e4567-e89b-12d3-a456-426614174001';
const groupCredentials = (groupId: string) => ({ apiKey: ['vxs', groupId, 'sample'].join('.') });
const legacyA = { customerId: '12025550101', secretKey: 'legacy-secret-a' };
const legacyB = { customerId: '12025550102', secretKey: 'legacy-secret-b' };
const groupA = groupCredentials(GROUP_ID_A);
const groupB = groupCredentials(GROUP_ID_B);

function context(
	saved: Record<string, unknown>,
	credentials: Record<string, string> = groupA,
	response: { statusCode: number; body?: unknown } = {
		statusCode: 200,
		body: { subscriptionId: 's', signingSecret: 'subscription-secret' },
	},
) {
	return {
		getWorkflowStaticData: () => saved,
		getCredentials: async () => credentials,
		getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/test',
		getNode: () => ({ name: 'VoxiSMS Trigger', type: 'voxiSmsTrigger' }),
		logger: { warn: jest.fn() },
		helpers: { httpRequestWithAuthentication: jest.fn().mockResolvedValue(response) },
	};
}

it('re-registers a group subscription for an unchanged identity without saving the key', async () => {
	const saved: Record<string, unknown> = {};
	const ctx = context(saved, groupA);
	await hooks.create.call(ctx as never);
	const originalState = { ...saved };

	ctx.helpers.httpRequestWithAuthentication.mockClear();
	await expect(hooks.checkExists.call(ctx as never)).resolves.toBe(false);
	await hooks.create.call(ctx as never);

	expect(saved).toEqual(originalState);
	expect(saved.credentialFingerprint).toMatch(/^[a-f0-9]{64}$/);
	expect(saved).not.toHaveProperty('apiKey');
	expect(JSON.stringify(saved)).not.toContain('sample');
	expect(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
		method: 'POST',
		url: 'https://api.voxisms.com/v2/webhook-subscriptions',
	});
});

it('preserves and fingerprints a legacy subscription saved before credential fingerprints were added', async () => {
	const saved: Record<string, unknown> = {
		subscriptionId: 's',
		signingSecret: 'subscription-secret',
	};
	const ctx = context(saved, legacyA);
	await expect(hooks.checkExists.call(ctx as never)).resolves.toBe(true);
	expect(ctx.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	expect(saved.subscriptionId).toBe('s');
	expect(saved.signingSecret).toBe('subscription-secret');
	expect(saved.credentialFingerprint).toMatch(/^[a-f0-9]{64}$/);
	expect(JSON.stringify(saved)).not.toContain('legacy-secret-a');
});

it.each([
	['another group key', groupA, groupB],
	['group to legacy', groupA, legacyA],
	['legacy to group', legacyA, groupA],
	['another legacy connection', legacyA, legacyB],
])('removes the old subscription before adding %s', async (_label, oldCredentials, newCredentials) => {
	const saved: Record<string, unknown> = {};
	const oldContext = context(saved, oldCredentials);
	await hooks.create.call(oldContext as never);

	const deleteContext = context(saved, oldCredentials);
	await hooks.delete.call(deleteContext as never);
	expect(saved).toEqual({});
	expect(deleteContext.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
		method: 'DELETE',
		url: 'https://api.voxisms.com/v2/webhook-subscriptions/s',
	});

	const newContext = context(saved, newCredentials);
	await expect(hooks.checkExists.call(newContext as never)).resolves.toBe(false);
	await hooks.create.call(newContext as never);
	expect(saved.subscriptionId).toBe('s');
	expect(newContext.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
		method: 'POST',
		url: 'https://api.voxisms.com/v2/webhook-subscriptions',
	});
});

it.each([
	['another group key', groupA, groupB],
	['group to legacy', groupA, legacyA],
	['legacy to group', legacyA, groupA],
	['another legacy connection', legacyA, legacyB],
])('refuses to overwrite a subscription if %s cannot delete it', async (_label, oldCredentials, newCredentials) => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, oldCredentials) as never);
	const originalState = { ...saved };
	const changedContext = context(saved, newCredentials);

	// This is the safe fallback when n8n no longer has the old credential available.
	await hooks.delete.call(changedContext as never);
	expect(saved).toEqual(originalState);
	expect(changedContext.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	await expect(hooks.checkExists.call(changedContext as never)).rejects.toThrow(
		'Deactivate the workflow before changing its VoxiSMS credential',
	);
	expect(saved).toEqual(originalState);
	expect(changedContext.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
});

it.each([401, 403, 503])('fails activation without changing saved state on HTTP %s', async (statusCode) => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, groupA) as never);
	const originalState = { ...saved };
	const ctx = context(saved, groupA, { statusCode, body: { error: 'Unavailable' } });
	await expect(hooks.create.call(ctx as never)).rejects.toThrow();
	expect(saved).toEqual(originalState);
});

it.each([
	{ subscriptionId: 'new' },
	{ subscriptionId: 123, signingSecret: 'new' },
	{ subscriptionId: 'new', signingSecret: ' ' },
	null,
])('does not partially overwrite state on malformed response %p', async (body) => {
	const saved = {
		subscriptionId: 'old',
		signingSecret: 'old-secret',
		usesApiKey: true,
		credentialFingerprint: 'old-fingerprint',
	};
	const ctx = context(saved, groupA, { statusCode: 200, body });
	await expect(hooks.create.call(ctx as never)).rejects.toThrow('did not return');
	expect(saved).toEqual({
		subscriptionId: 'old',
		signingSecret: 'old-secret',
		usesApiKey: true,
		credentialFingerprint: 'old-fingerprint',
	});
});

it.each([401, 403, 404, 503])('retains the saved state when deletion is not confirmed by HTTP %s', async (statusCode) => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, groupA) as never);
	const originalState = { ...saved };
	const ctx = context(saved, groupA, { statusCode });

	await expect(hooks.delete.call(ctx as never)).resolves.toBe(true);
	expect(saved).toEqual(originalState);
	expect(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
		method: 'DELETE',
		returnFullResponse: true,
	});
});

it('does not expose transport request headers when activation fails', async () => {
	const saved = { subscriptionId: 'old', signingSecret: 'old-secret' };
	const ctx = context(saved, groupA);
	ctx.helpers.httpRequestWithAuthentication.mockRejectedValue({
		message: 'private marker',
		request: { headers: { Authorization: 'Bearer private marker' } },
		response: { status: 503 },
	});
	try {
		await hooks.create.call(ctx as never);
		throw new Error('Expected failure');
	} catch (error) {
		expect(JSON.stringify(error)).not.toContain('private marker');
		expect((error as { errorResponse: unknown }).errorResponse).not.toHaveProperty('request');
		expect((error as { httpCode: string }).httpCode).toBe('503');
	}
	expect(saved).toEqual({ subscriptionId: 'old', signingSecret: 'old-secret' });
});

it('sanitizes a wrapped HTTP-client error during activation', async () => {
	const saved = { subscriptionId: 'old', signingSecret: 'old-secret' };
	const ctx = context(saved, groupA);
	const wrapped = new NodeApiError(
		ctx.getNode() as never,
		{ request: { headers: { Authorization: 'Bearer private marker' } } },
		{ message: 'private marker', httpCode: '503' },
	);
	ctx.helpers.httpRequestWithAuthentication.mockRejectedValue(wrapped);
	try {
		await hooks.create.call(ctx as never);
		throw new Error('Expected failure');
	} catch (error) {
		expect(error).not.toBe(wrapped);
		expect(JSON.stringify(error)).not.toContain('private marker');
		expect((error as { errorResponse: unknown }).errorResponse).not.toHaveProperty('request');
	}
});
