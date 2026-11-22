# CloudVault Sync

CloudVault Sync is an Obsidian plugin project intended to synchronize the **same vault** across Google Drive, Microsoft OneDrive, and MEGA on desktop, Android, and iOS.

## Current development status

This repository is in early development. The current `main` branch contains:
- Obsidian plugin/build scaffolding and local change journal.
- Google Drive OAuth 2.0 authorization-code + PKCE URL generation and callback validation.
- A Google Drive REST adapter for reading the start-page token, listing change pages, and listing files in a configured folder.

**Important:** Google Drive connection is currently a preview, not a working sync integration. The OAuth callback exchanges the code but does not yet securely persist access/refresh tokens. The Drive adapter is not yet wired to upload, download, or reconcile vault changes. Do not rely on this build to sync or back up files.

## Setup

- Node.js 20+
- npm

```bash
npm install
npm run check
npm run build
```

For live development, run `npm run dev`.

Copy `manifest.json` and `main.js` into:
`<YourVault>/.obsidian/plugins/cloudvault-sync/`.

## Google OAuth configuration (preview)

Create an OAuth client in Google Cloud Console and configure a redirect URI supported by your chosen Obsidian platform/client. Enter the client ID and the exact redirect URI in the plugin settings.

The plugin does not ask for or store a client secret. The OAuth redirect URI must be registered exactly. OAuth flow and token handling still require platform-specific validation before production use.

## Safety requirements

- Never silently overwrite conflicting files.
- Never permanently delete remote data by default.
- Never store plaintext provider credentials or tokens.
- Resume interrupted work after restart.
- A provider outage must not block other providers.
- When encryption is enabled, never fall back to uploading plaintext.

These are project requirements, not claims that all safeguards are already implemented.

## Planned next work

1. Secure token storage and refresh lifecycle for Google Drive.
2. Persisted change cursors and complete handling of remote updates/deletions.
3. Conflict detection and recoverable conflict copies.
4. Encrypted upload/download with resumable transfers.
5. Independent OneDrive and MEGA adapters.
6. Cross-platform validation on desktop, Android, and iOS.

## License

MIT was proposed as the intended license but has not yet been confirmed or added.
