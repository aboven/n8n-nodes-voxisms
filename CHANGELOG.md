# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
