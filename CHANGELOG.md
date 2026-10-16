# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- One API key to connect a phone group, with existing Customer ID and Token connections still supported.
- Optional Reply to Message ID to answer through the receiving phone and SIM.
- Group subscriptions revalidated when a workflow is activated, including after access is revoked and recreated.

### Fixed

- Keep credentials off redirected requests and requests to other hosts.
- Preserve saved trigger state on incomplete subscription responses and keep request credentials out of connection errors.
- Reuse a stable submission ID in the group auto-reply example when an incoming message is delivered again.

## [0.3.1] - 2026-10-01

### Fixed

- Codex `node` identifiers now use the fully-qualified `<package-name>.<nodeName>` format n8n requires.

## [0.3.0] - 2026-09-17

### Added

- Resource (SMS) and Operation (Send) selectors on the VoxiSMS node. Workflows built with earlier versions keep working.
- VoxiSMS brand icon, with a variant for n8n's dark theme.
- Node category and documentation links shown in n8n.
- Example workflow that auto-replies to inbound SMS.

### Changed

- Error messages now say what happened and how to fix it.
- README follows n8n's community node template and links to the VoxiSMS API reference.

## [0.2.0] - 2026-09-16

### Changed

- Requests are signed by the VoxiSMS API credential, and the credential test uses n8n's built-in request test.
- Published from GitHub Actions with npm provenance.

## [0.1.0] - 2026-07-24

### Added

- VoxiSMS node to send an SMS.
- VoxiSMS Trigger to start workflows on inbound SMS.
