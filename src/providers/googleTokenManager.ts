import { EncryptedTokenVault, type StoredTokenEnvelope, type TokenBundle } from "./encryptedTokenVault";
import type { GoogleTokenResponse } from "./googleDriveAuth";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface TokenEnvelopeStore {
  read(): Promise<StoredTokenEnvelope | undefined>;
  write(envelope: StoredTokenEnvelope | undefined): Promise<void>;
}

/** Manages short-lived access tokens without persisting plaintext credentials. */
export class GoogleTokenManager {
  private unlockedTokens?: TokenBundle;
  private readonly vault = new EncryptedTokenVault();

  constructor(
    private clientId: string,
    private readonly store: TokenEnvelopeStore,
  ) {}

  setClientId(clientId: string): void { this.clientId = clientId; }

  isUnlocked(): boolean { return Boolean(this.unlockedTokens); }

  async saveAuthorization(response: GoogleTokenResponse, passphrase: string): Promise<void> {
    if (!response.access_token || !response.expires_in) throw new Error("Google did not return a usable access token.");
    const tokens: TokenBundle = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
      scope: response.scope,
    };
    const encrypted = await this.vault.seal(tokens, passphrase);
    await this.store.write(encrypted);
    this.unlockedTokens = tokens;
  }

  async unlock(passphrase: string): Promise<void> {
    const envelope = await this.store.read();
    if (!envelope) throw new Error("No Google Drive credentials are saved on this device.");
    this.unlockedTokens = await this.vault.open(envelope, passphrase);
  }

  lock(): void {
    this.unlockedTokens = undefined;
  }

  async getAccessToken(): Promise<string> {
    if (!this.unlockedTokens) throw new Error("Unlock Google Drive credentials before syncing.");
    if (this.unlockedTokens.expiresAt > Date.now() + 60_000) return this.unlockedTokens.accessToken;
    if (!this.unlockedTokens.refreshToken) throw new Error("Google refresh token is unavailable. Reconnect Google Drive.");

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        grant_type: "refresh_token",
        refresh_token: this.unlockedTokens.refreshToken,
      }),
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) this.lock();
      throw new Error(`Google token refresh failed (${response.status}). Reconnect if access was revoked.`);
    }

    const refreshed = await response.json() as GoogleTokenResponse;
    this.unlockedTokens = {
      ...this.unlockedTokens,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? this.unlockedTokens.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      scope: refreshed.scope ?? this.unlockedTokens.scope,
    };
    // Caller must persist the refreshed encrypted envelope before app shutdown.
    return this.unlockedTokens.accessToken;
  }

  async persistUnlockedTokens(passphrase: string): Promise<void> {
    if (!this.unlockedTokens) return;
    await this.store.write(await this.vault.seal(this.unlockedTokens, passphrase));
  }
}
