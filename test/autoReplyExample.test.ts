import { Expression } from 'n8n-workflow';
import example from '../examples/auto-reply-to-inbound-sms.json';

const parameters = example.nodes.find((node) => node.type.endsWith('.voxiSms'))!.parameters as Record<string, string>;
const incomingId = '69d44359-1c82-4f84-a9a0-45c89bb4ce98';

function evaluate(parameter: string, workflowId = 'workflowA', messageId = incomingId) {
	return new Expression('UTC').resolveSimpleParameterValue(parameters[parameter], {
		$workflow: { id: workflowId }, $json: { messageId, fromNumber: '+12025550101' },
	} as never);
}

it('reuses one valid submission ID when an incoming message is delivered again', () => {
	const id = evaluate('id');
	expect(id).toMatch(/^[A-Za-z0-9_:-]{1,128}$/);
	expect(evaluate('id')).toBe(id);
	expect(evaluate('replyToMessageId')).toBe(incomingId);
	expect(evaluate('recipient')).toBe('+12025550101');
});

it('keeps different workflows and incoming messages independent', () => {
	const id = evaluate('id');
	expect(evaluate('id', 'workflowB')).not.toBe(id);
	expect(evaluate('id', 'workflowA', '7b45173a-cf08-4bf3-a6de-6442ef9636a8')).not.toBe(id);
});
