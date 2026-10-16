import { NodeHelpers, type INode, type INodeParameters, type INodeProperties, type INodePropertyOptions } from 'n8n-workflow';

import { VoxiSms } from '../nodes/VoxiSms/VoxiSms.node';

const description = new VoxiSms().description;

function property(name: string): INodeProperties {
	const found = description.properties.find((p) => p.name === name);
	if (!found) {
		throw new Error(`property "${name}" not found`);
	}
	return found as INodeProperties;
}

describe('VoxiSms node description', () => {
	it('defaults resource to "sms" without expressions', () => {
		const resource = property('resource');
		expect(resource.default).toBe('sms');
		expect(resource.noDataExpression).toBe(true);
		expect((resource.options as INodePropertyOptions[]).map((o) => o.value)).toEqual(['sms']);
	});

	it('defaults operation to "send", shown only for resource sms', () => {
		const operation = property('operation');
		expect(operation.default).toBe('send');
		expect(operation.noDataExpression).toBe(true);
		expect(operation.displayOptions).toEqual({ show: { resource: ['sms'] } });
		expect((operation.options as INodePropertyOptions[]).map((o) => o.value)).toEqual(['send']);
	});

	it.each(['recipient', 'message', 'id'])(
		'keeps "%s" with its internal name, shown for sms/send',
		(name) => {
			const param = property(name);
			expect(param.name).toBe(name);
			expect(param.displayOptions).toEqual({
				show: { resource: ['sms'], operation: ['send'] },
			});
		},
	);

	it.each([
		['version 1', 1, {}, false],
		['version 2 by default', 2, {}, true],
		['version 2 with API key authentication', 2, { authMethod: 'apiKey' }, true],
		['version 2 with legacy authentication', 2, { authMethod: 'legacy' }, false],
	])('shows the reply reference only with API key authentication (%s)', (_label, typeVersion, parameters: INodeParameters, shown) => {
		const node = { typeVersion } as INode;
		const resolved = NodeHelpers.getNodeParameters(
			description.properties,
			{ resource: 'sms', operation: 'send', ...parameters },
			true,
			false,
			node,
			description,
		)!;
		expect(NodeHelpers.displayParameter(resolved, property('replyToMessageId'), node, description)).toBe(shown);
	});

	it('keeps version 1 for existing workflows and defaults new nodes to version 2', () => {
		expect(description.version).toEqual([1, 2]);
		expect(description.defaultVersion).toBe(2);
		expect(description.usableAsTool).toBe(true);
	});
});

it('places Authentication first and the optional reply reference after the standard send fields', () => {
	expect(description.properties.map(p => p.name)).toEqual(['authMethod', 'authMethod', 'resource', 'operation', 'recipient', 'message', 'id', 'replyToMessageId']);
});
