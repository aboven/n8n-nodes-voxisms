# @voxiness/n8n-nodes-voxisms

n8n community nodes for [VoxiSMS](https://voxisms.com): send SMS through the VoxiSMS ecosystem, and start workflows on inbound SMS.

Two nodes:

- **VoxiSMS** (action node): sends an SMS.
- **VoxiSMS Trigger** (trigger node, "New Inbound SMS"): starts the workflow when your VoxiSMS number receives an inbound SMS.

## Installation

### n8n GUI (Community Nodes)

**Settings → Community Nodes → Install**, then enter the package name:

```
@voxiness/n8n-nodes-voxisms
```

### Self-hosted (npm)

```bash
npm install @voxiness/n8n-nodes-voxisms
```

Restart n8n after installing.

## Credentials

Both nodes use the **VoxiSMS API** credential type: `Customer ID` + `Token`. Get both from the "Link your phone" page in your VoxiPlan dashboard: https://app.voxiplan.com/voxisms

- **Customer ID**: the phone number you registered, without the leading `+` (e.g. `33639980000`). Listed under "Register your number".
- **Token**: listed under "Activate your token". The same token you paste into the VoxiSMS Android app during setup.

Use the credential's "Test" button to verify your setup. It performs a signed, read-only status check and does **not** send an SMS.

## Nodes

### VoxiSMS (Send SMS)

| Field | Required | Description |
|---|---|---|
| Recipient | yes | Phone number in E.164 format (e.g. `+15551234567`) |
| Message | yes | The SMS text content |
| Message ID | no | Optional custom message id; a UUID is generated automatically if left empty |

On success, the node outputs `{ messageId, sqsMessageId }`.

### VoxiSMS Trigger (New Inbound SMS)

Instant (webhook) trigger, no configurable parameters. Activating the workflow registers a webhook subscription with VoxiSMS using n8n's auto-generated webhook URL; deactivating the workflow removes it.

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

Notes:

- Every delivery is HMAC-verified (`X-VoxiSMS-Signature` / `X-VoxiSMS-Timestamp`) before the workflow fires. An unsigned request is dropped quietly; a present-but-invalid signature is rejected and never fires the workflow.
- Deliveries are **at-least-once**: VoxiSMS may retry a delivery, and n8n does not de-duplicate incoming webhook payloads. Use `eventId` to de-duplicate downstream if your workflow needs exactly-once processing.

## Building from source

```bash
npm install     # install dependencies
npm run build   # compile TypeScript and copy node icons into dist/
npm test        # run the unit tests
```

If your n8n instance restricts outbound network access, allow `api.voxisms.com`.

## License

MIT, see [LICENSE](LICENSE).
