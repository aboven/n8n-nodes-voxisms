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

Phone-group API keys and **Reply to Message ID** are unreleased. Published version 0.3.1 uses **Customer ID** and **Token**. The group instructions below describe the upcoming version.

For a phone group, expand **API access** in its dashboard card and create an API key. Paste it into the credential's **API Key** field. No phone number or group ID is needed. The same key can be reused in n8n, Make, Zapier and your own server-side clients.

Existing phone-number connections keep their **Customer ID** and **Token**. Leave API Key empty for these connections; saved credentials and workflows keep working without reconnecting.

Use **Test** to check the connection. For a group, use its dashboard API key rather than a phone connection key.

Rotation gives you 24 hours to replace the old key in every integration. Existing triggers retain their signing secrets. Revoking group API access stops new calls and future webhook deliveries; it does not disconnect phones or cancel SMS already accepted. After revoking and creating new access, reactivate triggers to register fresh subscriptions. Changing to another group's key also requires trigger reactivation. A key is shown only once in the dashboard.

## Compatibility

Tested against n8n 2.31.5 (which requires Node.js 22.22 or later).

That compatibility check predates phone-group support. The new group flow has local automated coverage; a complete connection, send and trigger test in n8n is still required before release.

The VoxiSMS Trigger needs n8n reachable at a public HTTPS webhook URL: VoxiSMS must be able to reach it to deliver inbound SMS events. If your n8n instance restricts outbound network access, allow `api.voxisms.com`.

## Usage

### VoxiSMS (Send SMS)

| Field | Required | Description |
|---|---|---|
| Resource | yes | Fixed to "SMS" |
| Operation | yes | Fixed to "Send" |
| Recipient | yes | Phone number in E.164 format (e.g. `+12025550101`) |
| Message | yes | The SMS message content |
| Message ID | no | Optional message reference. With a group key, it also prevents duplicate submissions: 1–128 letters, digits, `_`, `:`, or `-`. Reuse it with the same content and recipient to recover the same message. A different payload returns 409. A fresh UUID is generated when empty, so retrying the node can send again. |
| Reply to Message ID | no | With a group key, map the incoming trigger’s `messageId` to retain its receiving phone and SIM. Legacy credentials do not support this field. |

Group keys return `{ messageId, status: "accepted" }`; existing connections retain their current response fields. Acceptance is not delivery confirmation. The recipient must match the incoming sender for a reply. Replies stay assigned to the receiving phone and SIM. If that SIM is unavailable, VoxiSMS does not send through another SIM. The phone must run the SIM-aware app version for safe group replies.

### VoxiSMS Trigger

No configurable parameters. Activating the workflow registers a webhook subscription with VoxiSMS using n8n's auto-generated webhook URL. Deactivating the workflow removes it.

Each verified delivery emits one item shaped as an `InboundMessageEvent`:

```json
{
  "version": "1",
  "event": "inbound_message.received",
  "eventId": "evt_0f2f8f0e-924a-5b8b-8352-6fc04c31ddbd",
  "messageId": "69d44359-1c82-4f84-a9a0-45c89bb4ce98",
  "customerId": "12025550102",
  "occurredAt": "2026-07-14T14:42:18.123Z",
  "messageType": "sms",
  "fromNumber": "+12025550101",
  "toNumber": "+12025550102",
  "content": "Yes, that works for me"
}
```

Every delivery is HMAC-verified (`X-VoxiSMS-Signature` / `X-VoxiSMS-Timestamp`) before the workflow fires. An unsigned request is dropped quietly; a present-but-invalid signature is rejected and never fires the workflow.

Deliveries are at-least-once: VoxiSMS may retry a delivery, and n8n does not de-duplicate incoming webhook payloads. Use `eventId` to de-duplicate downstream if your workflow needs exactly-once processing.

### Example workflow

[examples/auto-reply-to-inbound-sms.json](examples/auto-reply-to-inbound-sms.json) shows a VoxiSMS Trigger connected to a VoxiSMS node that sends an automatic reply to the sender.

This example uses a **group API key** and maps `messageId` into **Reply to Message ID**. Do not map `eventId` or look up the last message from a recipient. For an existing legacy connection, omit that new field; ordinary legacy sending remains unchanged.

Its **Message ID** combines the saved workflow ID and incoming `messageId`. Repeated deliveries to the same workflow therefore reuse the same submission ID; another workflow or incoming message gets a different ID. Keep the recipient and reply content unchanged when retrying that ID. This prevents duplicate API submissions with a group key, not every possible duplicate SMS delivery.

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
