import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

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

	it('keeps the node version and tool usability unchanged', () => {
		expect(description.version).toBe(1);
		expect(description.usableAsTool).toBe(true);
	});
});
