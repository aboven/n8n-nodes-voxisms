# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0] - 2026-11-07

### Added

- Version 2 of the VoxiSMS and VoxiSMS Trigger nodes, used by new workflows. Its **Authentication** field defaults to **API Key**, which connects with a phone-group API key through the new **VoxiSMS API** credential and can reply through the receiving phone and SIM. Choose **Legacy Customer ID + Token** to connect a new node with the **VoxiSMS Legacy API** credential instead. Each choice shows only its matching credential.

### Changed

- The Customer ID and Token credential is now named **VoxiSMS Legacy API**. Existing workflows stay on node version 1 and keep using their saved credentials without reconnecting.

### Fixed

- Safely replace trigger credentials or Authentication without orphaning or reusing an existing webhook subscription.
- Return documented send fields and provide credential guidance for 401/403 responses.
- Keep VoxiSMS credentials restricted to the VoxiSMS API host, and use stable submission IDs in the auto-reply example.

## [0.3.1] - 2026-10-01

### Fixed

- Node metadata uses the fully qualified identifier format required by n8n.

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
