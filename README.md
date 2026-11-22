# CloudVault Sync

CloudVault Sync is an Obsidian plugin project intended to synchronize the **same vault** across Google Drive, Microsoft OneDrive, and MEGA on desktop, Android, and iOS.

## Current development status

The current `main` branch includes:
- Obsidian plugin/build scaffolding and a persisted local change journal.
- Google Drive OAuth 2.0 authorization-code + PKCE URL generation and callback-state validation.
- A Google Drive REST read adapter for start-page tokens, change pages, and paginated folder listings.
- An AES-256-GCM token-encryption utility using PBKDF2-SHA256, with no passphrase retained by the utility.
- Google OAuth callback now stores the returned token bundle only as an encrypted envelope in Obsidian plugin data.
- A passphrase modal to create/unlock credentials and explicitly lock the in-memory token session; the passphrase is not persisted.
- A Google access-token manager with refresh-token handling.
- AES-256-GCM file encryption with per-file salt/IV and authenticated decryption.
- Google Drive resumable encrypted uploads in aligned chunks, with encrypted pending payloads and upload-session offsets persisted for restart recovery.
- Download-and-decrypt support plus a restore helper that creates a timestamped conflict copy rather than overwriting an existing vault file.
- Opaque remote filenames and hashed path metadata to avoid exposing original vault paths in Google Drive listings.
- A pure conflict-decision engine that distinguishes one-sided edits, two-sided edits, and deletion-vs-edit conflicts.
- Automated tests for token encryption and conflict decisions, included in CI.

**Important:** this is still not a working end-to-end sync release. Google credentials can now be saved encrypted and manually unlocked/locked, but OAuth redirect compatibility must be validated with the exact Google OAuth client type and on each Obsidian platform. Access-token refresh is implemented in the manager, but a refreshed token envelope must be re-sealed with the user's passphrase before it is persisted. The conflict detector is decision logic only; no upload, download, conflict-copy, or delete operation is executed. Do not rely on this build to sync or back up files.

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

Configure the redirect URI as `obsidian://cloudvault-sync-oauth` and enter the client ID plus that exact URI in plugin settings. The selected Google OAuth client type must permit this redirect scheme; this has not yet been validated against all Google client types or Obsidian mobile platforms. The plugin does not require a client secret in its current PKCE flow. After Google returns to Obsidian, create a strong passphrase (12+ characters) to encrypt the token bundle. Unlock it when needed and lock it when finished. Set a destination folder ID. Use the Obsidian command palette commands **Upload active file to Google Drive (encrypted)** and **Resume pending Google Drive uploads**. File contents are encrypted before upload; remote names are opaque hashes. Losing the passphrase means encrypted content cannot be recovered.

## Safety requirements

- Never silently overwrite conflicting files.
- Never permanently delete remote data by default.
- Never store plaintext provider credentials or tokens.
- Resume interrupted work after restart.
- A provider outage must not block other providers.
- When encryption is enabled, never fall back to uploading plaintext.

These are project requirements. The modules listed above are foundations and do not yet constitute a complete synchronization implementation.

## Next work

1. Validate OAuth callback compatibility on desktop, Android, and iOS.
2. Implement remote file discovery and encrypted download into the local vault using the no-overwrite restore path.
3. Add baseline tracking and an explicit conflict-resolution UI.
4. Add remote change cursor persistence and automatic two-way reconciliation.
5. Add independent OneDrive and MEGA adapters.
6. Validate interrupted transfers and platform behavior on desktop, Android, and iOS.

## License

MIT was proposed as the intended license but has not yet been confirmed or added.
