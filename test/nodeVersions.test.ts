import {
	NodeHelpers,
	validateNodeCredentials,
	type INode,
	type INodeParameters,
	type INodeProperties,
	type INodePropertyOptions,
	type INodeType,
} from 'n8n-workflow';

import { VoxiSms } from '../nodes/VoxiSms/VoxiSms.node';
import { VoxiSmsTrigger } from '../nodes/VoxiSmsTrigger/VoxiSmsTrigger.node';

function node(type: string, typeVersion: number, parameters: INodeParameters = {}, credentials: INode['credentials'] = {}): INode {
	return {
		id: 'node', name: 'VoxiSMS', type, typeVersion, position: [0, 0],
		parameters: { resource: 'sms', operation: 'send', ...parameters }, credentials,
	};
}

describe.each([
	['VoxiSMS', new VoxiSms() as INodeType],
	['VoxiSMS Trigger', new VoxiSmsTrigger() as INodeType],
])('%s authentication', (_label, nodeType) => {
	const { name, credentials = [], properties } = nodeType.description;

	// n8n fills in default parameter values before the editor and executions evaluate
	// credential displayOptions (the editor's node store and the Workflow constructor).
	function resolved(current: INode): INode {
		const parameters = NodeHelpers.getNodeParameters(properties, current.parameters, true, false, current, nodeType.description);
		return { ...current, parameters: parameters ?? {} };
	}

	// The editor saves only values that differ from the defaults, and publish validation
	// checks those saved parameters as they are.
	function saved(current: INode): INode {
		const parameters = NodeHelpers.getNodeParameters(properties, resolved(current).parameters, false, false, current, nodeType.description);
		return { ...current, parameters: parameters ?? {} };
	}

	function shownCredentials(current: INode): string[] {
		return credentials
			.filter((credential) => NodeHelpers.displayParameter(current.parameters, credential, current, nodeType.description))
			.map((credential) => credential.name);
	}

	function visibleProperties(current: INode): INodeProperties[] {
		return properties.filter((property) => property.type !== 'hidden' &&
			NodeHelpers.displayParameter(current.parameters, property, current, nodeType.description));
	}

	it('shows a version 2 Authentication selector that defaults to an API key', () => {
		const selector = visibleProperties(resolved(node(name, 2)))[0];
		expect(selector).toMatchObject({ displayName: 'Authentication', name: 'authMethod', type: 'options', default: 'apiKey', noDataExpression: true });
		expect((selector.options as INodePropertyOptions[]).map(({ name, value }) => [name, value])).toEqual([
			['API Key', 'apiKey'],
			['Legacy Customer ID + Token', 'legacy'],
		]);
		expect(resolved(node(name, 2)).parameters.authMethod).toBe('apiKey');
	});

	it('does not show an Authentication selector on version 1', () => {
		expect(visibleProperties(resolved(node(name, 1))).map((property) => property.name)).not.toContain('authMethod');
		expect(resolved(node(name, 1)).parameters.authMethod).toBe('legacy');
	});

	it.each([
		['version 1', 1, {}, ['voxiSmsApi']],
		['version 2 by default', 2, {}, ['voxiSmsGroupApi']],
		['version 2 with API key authentication', 2, { authMethod: 'apiKey' }, ['voxiSmsGroupApi']],
		['version 2 with legacy authentication', 2, { authMethod: 'legacy' }, ['voxiSmsApi']],
	])('%s shows only its matching credential', (_label, typeVersion, parameters, expected) => {
		const current = resolved(node(name, typeVersion, parameters));
		expect(shownCredentials(current)).toEqual(expected);
	});

	// The selector is visible only while n8n does not treat it as the node's main auth
	// field: n8n 2.x hides a parameter named `authentication`, or one whose options all
	// appear in credential `show` rules, and moves that choice into the credential dialog.
	it('keeps the selector out of n8n\'s main authentication field detection', () => {
		expect(properties.map((property) => property.name)).not.toContain('authentication');
		const shownFor = credentials.flatMap((credential) => credential.displayOptions?.show?.authMethod ?? []);
		const selector = properties.find((property) => property.name === 'authMethod' && property.type === 'options');
		const options = (selector?.options as INodePropertyOptions[]).map((option) => option.value);
		expect(options.every((value) => shownFor.includes(value))).toBe(false);
	});

	it('keeps a saved version 1 workflow with its legacy credential valid', () => {
		const current = node(name, 1, {}, { voxiSmsApi: { id: 'legacy', name: 'VoxiSMS account' } });
		expect(saved(current).parameters).not.toHaveProperty('authMethod');
		expect(validateNodeCredentials(saved(current), nodeType)).toEqual([]);
		expect(shownCredentials(resolved(saved(current)))).toEqual(['voxiSmsApi']);
	});

	it.each([
		['the default API key', {}, ['voxiSmsGroupApi']],
		['legacy authentication', { authMethod: 'legacy' }, ['voxiSmsApi']],
	])('asks a saved version 2 node using %s for its credential only', (_label, parameters, expected) => {
		const issues = validateNodeCredentials(saved(node(name, 2, parameters)), nodeType);
		expect(issues.map((issue) => issue.credentialName)).toEqual(expected);
	});

	it.each([
		['the default API key', {}, { voxiSmsGroupApi: { id: 'key', name: 'VoxiSMS API' } }],
		['legacy authentication', { authMethod: 'legacy' }, { voxiSmsApi: { id: 'legacy', name: 'VoxiSMS Legacy API' } }],
	])('accepts a saved version 2 node using %s with its credential', (_label, parameters, nodeCredentials) => {
		expect(validateNodeCredentials(saved(node(name, 2, parameters, nodeCredentials)), nodeType)).toEqual([]);
	});
});
