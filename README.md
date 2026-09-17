# @voxiness/n8n-nodes-voxisms

This is an n8n community node. It lets you send and receive SMS through your own Android phone using the VoxiSMS app, from your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  
[Development](#development)  
[License](#license)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

### n8n GUI (Community Nodes)

Go to **Settings > Community Nodes > Install**, then enter the package name:

```
@voxiness/n8n-nodes-voxisms
```

### Manual install (self-hosted)

Run inside your n8n data directory, then restart n8n. See the [manual installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation/) for details.

```bash
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm install @voxiness/n8n-nodes-voxisms
```

## Operations

- **VoxiSMS** node: SMS > Send. Sends an SMS through your VoxiSMS number.
- **VoxiSMS Trigger** node: starts the workflow when your VoxiSMS number receives an inbound SMS.

## Credentials

You need a VoxiSMS account and the VoxiSMS Android app installed and linked to your phone number.

Both nodes use the **VoxiSMS API** credential (Customer ID and Token). Find both on the "Link your phone" page of your VoxiPlan dashboard: https://app.voxiplan.com/voxisms

- **Customer ID**: the phone number you registered, without the leading `+` (e.g. `33639980000`). Listed under "Register your number".
- **Token**: listed under "Activate your token". This is the same token you paste into the VoxiSMS Android app during setup.

Use the credential's **Test** button to verify your setup. It performs a signed, read-only status check and does not send an SMS.

## Compatibility

Tested against n8n 2.31.5 (which requires Node.js 22.22 or later).

The VoxiSMS Trigger needs n8n reachable at a public HTTPS webhook URL: VoxiSMS must be able to reach it to deliver inbound SMS events. If your n8n instance restricts outbound network access, allow `api.voxisms.com`.

## Usage

### VoxiSMS (Send SMS)

| Field | Required | Description |
|---|---|---|
| Resource | yes | Fixed to "SMS" |
| Operation | yes | Fixed to "Send" |
| Recipient | yes | Phone number in E.164 format (e.g. `+15551234567`) |
| Message | yes | The SMS message content |
| Message ID | no | Optional custom message ID. A UUID is generated automatically if left empty. |

On success, the node outputs `{ messageId, sqsMessageId }`.

### VoxiSMS Trigger

No configurable parameters. Activating the workflow registers a webhook subscription with VoxiSMS using n8n's auto-generated webhook URL. Deactivating the workflow removes it.

Each verified delivery emits one item shaped as an `InboundMessageEvent`:

```json
{
  "version": "1",
  "event": "inbound_message.received",
  "eventId": "evt_0f2f8f0e-924a-5b8b-8352-6fc04c31ddbd",
  "messageId": "69d44359-1c82-4f84-a9a0-45c89bb4ce98",
  "customerId": "33639980000",
  "occurredAt": "2026-07-14T14:42:18.123Z",
  "messageType": "sms",
  "fromNumber": "+32470987654",
  "toNumber": "+33639980000",
  "content": "Yes, that works for me"
}
```

Every delivery is HMAC-verified (`X-VoxiSMS-Signature` / `X-VoxiSMS-Timestamp`) before the workflow fires. An unsigned request is dropped quietly; a present-but-invalid signature is rejected and never fires the workflow.

Deliveries are at-least-once: VoxiSMS may retry a delivery, and n8n does not de-duplicate incoming webhook payloads. Use `eventId` to de-duplicate downstream if your workflow needs exactly-once processing.

### Example workflow

[examples/auto-reply-to-inbound-sms.json](examples/auto-reply-to-inbound-sms.json) shows a VoxiSMS Trigger connected to a VoxiSMS node that sends an automatic reply to the sender.

To import it in n8n: open a workflow, use **Import from File** (or paste the file's contents onto the canvas), then select your VoxiSMS credential on both nodes.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [VoxiSMS API reference](https://docs.voxisms.com/)
- [VoxiSMS API authentication](https://docs.voxisms.com/#section/Authentication)
- [VoxiSMS API sending SMS](https://docs.voxisms.com/#tag/sms/operation/enqueue_message)
- [VoxiSMS API webhooks](https://docs.voxisms.com/#tag/webhooks)
- [VoxiSMS API inbound SMS delivery](https://docs.voxisms.com/#tag/webhooks/operation/inboundMessageReceivedDelivery)

## Development

```bash
npm install     # install dependencies
npm run build   # compile TypeScript and copy node icons into dist/
npm test        # run the unit tests
npm run lint    # type-check and run the n8n node linter
```

## License

[MIT](LICENSE)
