# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Phone-group API keys and replies through the receiving phone and SIM, while existing Customer ID and Token connections remain supported.

### Fixed

- Safely replace trigger credentials without orphaning an existing webhook subscription.
- Return documented send fields and provide credential guidance for 401/403 responses.
- Keep API keys restricted to the VoxiSMS host and stable submission IDs in the auto-reply example.

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
