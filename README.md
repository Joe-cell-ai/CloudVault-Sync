# CloudVault Sync

A local-first Obsidian plugin planned to synchronize one vault across **Google Drive, Microsoft OneDrive, and MEGA**, with independent provider state, two-way synchronization, client-side encryption, conflict protection, and recovery.

> **Early development:** this repository is a foundation scaffold, not a working cloud-sync release. The current build tracks and persists local vault changes. It does not authenticate with providers or upload/download vault files.

## Development

- Node.js 20+
- npm

```bash
npm install
npm run check
npm run build
```

For live development, run `npm run dev`.

Copy `manifest.json`, `main.js`, and `styles.css` (when present) into:
`<YourVault>/.obsidian/plugins/cloudvault-sync/`.

## Planned architecture

- Durable local change journal and queue
- Independent provider adapters for Google Drive, Microsoft OneDrive, and MEGA
- Two-way sync with per-provider cursors and resumable transfers
- Client-side encryption using Web Crypto; keys never sent to cloud providers
- Conflict copies, version history, and recoverable deletion
- Desktop, Android, and iOS support using Obsidian's cross-platform APIs

## Safety principles

- Never silently overwrite a conflicting file.
- Never permanently delete remote data by default.
- Do not store plaintext provider credentials.
- Resume interrupted work after restart.
- A provider outage must not block other providers.
- When encryption is enabled, never fall back to uploading plaintext.

## License

MIT License is the intended license; the license file will be added before the first public release.
