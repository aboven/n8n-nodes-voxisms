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

interface NodeSetup {
	typeVersion: number;
	// The version 2 Authentication selector. Omitted means its default (API key).
	authMethod?: string;
}

function context(
	saved: Record<string, unknown>,
	credentials: Record<string, string> = groupA,
	response: { statusCode: number; body?: unknown } = {
		statusCode: 200,
		body: { subscriptionId: 's', signingSecret: 'subscription-secret' },
	},
	// By default, API key credentials sit on a default version 2 node and legacy credentials
	// on a version 1 node.
	node: NodeSetup = { typeVersion: 'apiKey' in credentials ? 2 : 1 },
) {
	const { typeVersion, authMethod } = node;
	// Mirrors n8n: a node can only read the credential type its configuration shows.
	const credentialType = typeVersion >= 2 && authMethod !== 'legacy' ? 'voxiSmsGroupApi' : 'voxiSmsApi';
	return {
		getWorkflowStaticData: () => saved,
		getCredentials: jest.fn(async (type: string) => {
			if (type !== credentialType) throw new Error(`Node does not have any credentials set for "${type}"`);
			return credentials;
		}),
		getNodeParameter: jest.fn((name: string, fallback: unknown) =>
			name === 'authMethod' && authMethod !== undefined ? authMethod : fallback),
		getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/test',
		getNode: () => ({ name: 'VoxiSMS Trigger', type: 'voxiSmsTrigger', typeVersion }),
		logger: { warn: jest.fn() },
		helpers: { httpRequestWithAuthentication: jest.fn().mockResolvedValue(response) },
	};
}

const V1: NodeSetup = { typeVersion: 1 };
const V2_API_KEY: NodeSetup = { typeVersion: 2, authMethod: 'apiKey' };
const V2_LEGACY: NodeSetup = { typeVersion: 2, authMethod: 'legacy' };

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

it.each([
	['version 1', legacyA, V1, 'voxiSmsApi'],
	['version 2 by default', groupA, { typeVersion: 2 }, 'voxiSmsGroupApi'],
	['version 2 with API key authentication', groupA, V2_API_KEY, 'voxiSmsGroupApi'],
	['version 2 with legacy authentication', legacyA, V2_LEGACY, 'voxiSmsApi'],
])('%s subscribes with its own credential type', async (_label, credentials, node, credentialType) => {
	const saved: Record<string, unknown> = {};
	const ctx = context(saved, credentials, undefined, node);
	await hooks.create.call(ctx as never);
	expect(ctx.getCredentials).toHaveBeenCalledWith(credentialType);
	expect(ctx.getCredentials).toHaveBeenCalledTimes(1);
	expect(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][0]).toBe(credentialType);
	expect(JSON.parse(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][1].body)).toEqual({
		targetUrl: 'https://n8n.example.com/webhook/test',
		eventTypes: ['inbound_message.received'],
		provider: 'generic',
	});
	expect(saved).toMatchObject({ subscriptionId: 's', signingSecret: 'subscription-secret', usesApiKey: credentialType === 'voxiSmsGroupApi' });
});

it('keeps version 1 on the legacy credential even if an Authentication value is present', async () => {
	const saved: Record<string, unknown> = {};
	const ctx = context(saved, legacyA, undefined, { typeVersion: 1, authMethod: 'apiKey' });
	await hooks.create.call(ctx as never);
	expect(ctx.getNodeParameter).not.toHaveBeenCalled();
	expect(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][0]).toBe('voxiSmsApi');
});

it('rejects an unknown version 2 Authentication value without contacting VoxiSMS', async () => {
	const saved: Record<string, unknown> = {};
	const ctx = context(saved, groupA, undefined, { typeVersion: 2, authMethod: 'other' });
	await expect(hooks.create.call(ctx as never)).rejects.toThrow('Select an Authentication method');
	expect(ctx.getCredentials).not.toHaveBeenCalled();
	expect(saved).toEqual({});
});

it('keeps an unchanged version 2 legacy subscription without re-registering', async () => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, legacyA, undefined, V2_LEGACY) as never);
	expect(saved.credentialFingerprint).toMatch(/^[a-f0-9]{64}$/);
	expect(JSON.stringify(saved)).not.toContain('legacy-secret-a');
	const ctx = context(saved, legacyA, undefined, V2_LEGACY);
	await expect(hooks.checkExists.call(ctx as never)).resolves.toBe(true);
	expect(ctx.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
});

it('removes a version 2 legacy subscription with the legacy credential', async () => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, legacyA, undefined, V2_LEGACY) as never);
	const ctx = context(saved, legacyA, undefined, V2_LEGACY);
	await hooks.delete.call(ctx as never);
	expect(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][0]).toBe('voxiSmsApi');
	expect(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
		method: 'DELETE',
		url: 'https://api.voxisms.com/v2/webhook-subscriptions/s',
	});
	expect(saved).toEqual({});
});

it('does not let a version 2 legacy trigger adopt a subscription without a saved identity', async () => {
	const saved: Record<string, unknown> = { subscriptionId: 'old', signingSecret: 'old-secret' };
	const ctx = context(saved, legacyA, undefined, V2_LEGACY);
	await expect(hooks.checkExists.call(ctx as never)).rejects.toThrow(
		'Deactivate the workflow before changing its VoxiSMS credential or authentication',
	);
	await hooks.delete.call(ctx as never);
	expect(ctx.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	expect(saved).toEqual({ subscriptionId: 'old', signingSecret: 'old-secret', subscriptionCleanupRequired: true });
});

it.each([
	['API key to legacy', groupA, V2_API_KEY, legacyA, V2_LEGACY],
	['legacy to API key', legacyA, V2_LEGACY, groupA, V2_API_KEY],
	['legacy to the default API key', legacyA, V2_LEGACY, groupA, { typeVersion: 2 }],
])('does not reuse a version 2 subscription after switching Authentication from %s in place', async (
	_label, oldCredentials, oldNode, newCredentials, newNode,
) => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, oldCredentials, undefined, oldNode) as never);
	const originalState = { ...saved };
	const switched = context(saved, newCredentials, undefined, newNode);

	await expect(hooks.checkExists.call(switched as never)).rejects.toThrow(
		'Deactivate the workflow before changing its VoxiSMS credential or authentication',
	);
	await hooks.delete.call(switched as never);
	expect(switched.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	expect(saved).toEqual(originalState);
});

it('rejects a version 2 Authentication switch even when the new credential is not set yet', async () => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, groupA, undefined, V2_API_KEY) as never);
	const originalState = { ...saved };
	// The node now shows only the legacy credential, but it still holds the API key one.
	const switched = context(saved, groupA, undefined, V2_LEGACY);
	await expect(hooks.checkExists.call(switched as never)).rejects.toThrow();
	await expect(hooks.delete.call(switched as never)).resolves.toBe(true);
	expect(switched.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	expect(saved).toEqual(originalState);
});

it('keeps an unchanged version 1 legacy subscription without re-registering', async () => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, legacyA) as never);
	const ctx = context(saved, legacyA);
	await expect(hooks.checkExists.call(ctx as never)).resolves.toBe(true);
	expect(ctx.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
});

it('removes a subscription saved by 0.3.1 with the legacy credential', async () => {
	const saved: Record<string, unknown> = { subscriptionId: 'old', signingSecret: 'old-secret' };
	const ctx = context(saved, legacyA);
	await hooks.delete.call(ctx as never);
	expect(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][0]).toBe('voxiSmsApi');
	expect(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
		method: 'DELETE',
		url: 'https://api.voxisms.com/v2/webhook-subscriptions/old',
	});
	expect(saved).toEqual({});
});

it('does not let a version 2 trigger adopt a subscription without a saved identity', async () => {
	const saved: Record<string, unknown> = { subscriptionId: 'old', signingSecret: 'old-secret' };
	const ctx = context(saved, groupA);
	await expect(hooks.checkExists.call(ctx as never)).rejects.toThrow(
		'Deactivate the workflow before changing its VoxiSMS credential',
	);
	expect(ctx.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
});

it('rejects a version 2 key whose phone group cannot be identified', async () => {
	const saved: Record<string, unknown> = {};
	const ctx = context(saved, { apiKey: 'not-a-group-key' });
	await expect(hooks.create.call(ctx as never)).rejects.toThrow('could not identify the credential');
	expect(ctx.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	expect(saved).toEqual({});
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
	['another group key', groupA, undefined, groupB, undefined],
	['group to legacy', groupA, undefined, legacyA, undefined],
	['legacy to group', legacyA, undefined, groupA, undefined],
	['another legacy connection', legacyA, undefined, legacyB, undefined],
	['version 2 API key to version 2 legacy', groupA, V2_API_KEY, legacyA, V2_LEGACY],
	['version 2 legacy to version 2 API key', legacyA, V2_LEGACY, groupA, V2_API_KEY],
	['another version 2 legacy connection', legacyA, V2_LEGACY, legacyB, V2_LEGACY],
])('removes the old subscription before adding %s', async (_label, oldCredentials, oldNode, newCredentials, newNode) => {
	const saved: Record<string, unknown> = {};
	const oldContext = context(saved, oldCredentials, undefined, oldNode);
	await hooks.create.call(oldContext as never);

	const deleteContext = context(saved, oldCredentials, undefined, oldNode);
	await hooks.delete.call(deleteContext as never);
	expect(saved).toEqual({});
	expect(deleteContext.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
		method: 'DELETE',
		url: 'https://api.voxisms.com/v2/webhook-subscriptions/s',
	});

	const newContext = context(saved, newCredentials, undefined, newNode);
	await expect(hooks.checkExists.call(newContext as never)).resolves.toBe(false);
	await hooks.create.call(newContext as never);
	expect(saved.subscriptionId).toBe('s');
	expect(newContext.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
		method: 'POST',
		url: 'https://api.voxisms.com/v2/webhook-subscriptions',
	});
});

it.each([
	['another group key', groupA, undefined, groupB, undefined],
	['group to legacy', groupA, undefined, legacyA, undefined],
	['legacy to group', legacyA, undefined, groupA, undefined],
	['another legacy connection', legacyA, undefined, legacyB, undefined],
	['another version 2 legacy connection', legacyA, V2_LEGACY, legacyB, V2_LEGACY],
])('refuses to overwrite a subscription if %s cannot delete it', async (_label, oldCredentials, oldNode, newCredentials, newNode) => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, oldCredentials, undefined, oldNode) as never);
	const originalState = { ...saved };
	const changedContext = context(saved, newCredentials, undefined, newNode);

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
	expect(saved).toEqual({ ...originalState, subscriptionRemovalUnconfirmed: true });
	expect(ctx.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
		method: 'DELETE',
		returnFullResponse: true,
	});
});

it.each([
	['version 1 legacy', legacyA, V1],
	['version 2 legacy', legacyA, V2_LEGACY],
	['version 2 API key', groupA, V2_API_KEY],
])('re-registers a %s subscription after an unconfirmed removal', async (_label, credentials, node) => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, credentials, undefined, node) as never);

	// The DELETE response is lost, so VoxiSMS may already have removed the subscription.
	const deactivate = context(saved, credentials, undefined, node);
	deactivate.helpers.httpRequestWithAuthentication.mockRejectedValueOnce(new Error('socket hang up'));
	await expect(hooks.delete.call(deactivate as never)).resolves.toBe(true);
	expect(saved.subscriptionId).toBe('s');

	const reactivate = context(saved, credentials, { statusCode: 200 }, node);
	await expect(hooks.checkExists.call(reactivate as never)).resolves.toBe(false);
	expect(reactivate.helpers.httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
		method: 'DELETE',
		url: 'https://api.voxisms.com/v2/webhook-subscriptions/s',
	});
	expect(saved).toEqual({});

	reactivate.helpers.httpRequestWithAuthentication.mockResolvedValueOnce({
		statusCode: 200,
		body: { subscriptionId: 's2', signingSecret: 'new-secret' },
	});
	await hooks.create.call(reactivate as never);
	expect(reactivate.helpers.httpRequestWithAuthentication.mock.calls[1][1]).toMatchObject({ method: 'POST' });
	expect(saved).toMatchObject({ subscriptionId: 's2', signingSecret: 'new-secret' });
	expect(saved).not.toHaveProperty('subscriptionRemovalUnconfirmed');
});

it('does not claim a legacy subscription is active when its earlier removal still cannot be confirmed', async () => {
	const saved: Record<string, unknown> = {};
	await hooks.create.call(context(saved, legacyA) as never);
	await hooks.delete.call(context(saved, legacyA, { statusCode: 503 }) as never);
	const retainedState = { ...saved };
	expect(retainedState).toMatchObject({ subscriptionId: 's', subscriptionRemovalUnconfirmed: true });

	const reactivate = context(saved, legacyA, { statusCode: 503 });
	await expect(hooks.checkExists.call(reactivate as never)).rejects.toThrow(
		"could not confirm the state of this trigger's previous webhook subscription",
	);
	expect(reactivate.helpers.httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
	expect(saved).toEqual(retainedState);
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
