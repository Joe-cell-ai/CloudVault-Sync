# CloudVault Sync

CloudVault Sync is an Obsidian plugin project intended to synchronize the **same vault** across Google Drive, Microsoft OneDrive, and MEGA on desktop, Android, and iOS.

## Current development status

The current `main` branch includes:
- Obsidian plugin/build scaffolding and a persisted local change journal.
- Google Drive OAuth 2.0 authorization-code + PKCE URL generation and callback-state validation.
- A Google Drive REST read adapter for start-page tokens, change pages, and paginated folder listings.
- An AES-256-GCM token-encryption utility using PBKDF2-SHA256, with no passphrase retained by the utility.
- A Google access-token manager with refresh-token handling.
- A pure conflict-decision engine that distinguishes one-sided edits, two-sided edits, and deletion-vs-edit conflicts.
- Automated tests for token encryption and conflict decisions, included in CI.

**Important:** this is still not a working end-to-end sync release. The encrypted token vault and token manager are implemented as modules but are not yet connected to the settings UI or plugin persistence. OAuth callback still does not save credentials through the encrypted vault. The conflict detector is decision logic only; no upload, download, conflict-copy, or delete operation is executed. Do not rely on this build to sync or back up files.

## Setup and checks

- Node.js 20+
- npm

```bash
npm install
npm run check
npm test
npm run build
```

For live development, run `npm run dev`.

Copy `manifest.json` and `main.js` into:
`<YourVault>/.obsidian/plugins/cloudvault-sync/`.

## Google OAuth configuration (preview)

Create an OAuth client in Google Cloud Console and configure a redirect URI supported by your chosen Obsidian platform/client. Enter the client ID and exact redirect URI in plugin settings. The plugin does not require a client secret in its current PKCE flow. Redirect handling and refresh-token behavior still require platform-specific validation before production use.

## Safety requirements

- Never silently overwrite conflicting files.
- Never permanently delete remote data by default.
- Never store plaintext provider credentials or tokens.
- Resume interrupted work after restart.
- A provider outage must not block other providers.
- When encryption is enabled, never fall back to uploading plaintext.

These are project requirements. The modules listed above are foundations and do not yet constitute a complete synchronization implementation.

## Next work

1. Wire encrypted credentials into plugin storage and a user-controlled unlock/lock flow.
2. Persist provider change cursors and process remote changes safely.
3. Create recoverable conflict copies and explicit conflict-resolution UI.
4. Implement encrypted, resumable upload/download.
5. Add independent OneDrive and MEGA adapters.
6. Validate desktop, Android, and iOS behavior.

## License

MIT was proposed as the intended license but has not yet been confirmed or added.
