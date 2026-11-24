import { EncryptedTokenVault, type StoredTokenEnvelope, type TokenBundle } from "./encryptedTokenVault";
import type { OneDriveTokenResponse } from "./oneDriveAuth";

export interface OneDriveTokenStore {
  read(): Promise<StoredTokenEnvelope | undefined>;
  write(value: StoredTokenEnvelope | undefined): Promise<void>;
}

/** Keeps Microsoft tokens encrypted at rest and exposes access tokens only while unlocked. */
export class OneDriveTokenManager {
  private tokens?: TokenBundle;
  private readonly vault = new EncryptedTokenVault();
  constructor(private clientId: string, private readonly store: OneDriveTokenStore) {}
  setClientId(value: string): void { this.clientId = value; }
  isUnlocked(): boolean { return Boolean(this.tokens); }
  async saveAuthorization(response: OneDriveTokenResponse, passphrase: string): Promise<void> {
    if (!response.access_token || !response.expires_in) throw new Error("Microsoft did not return a usable access token.");
    this.tokens = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
      scope: response.scope,
    };
    await this.store.write(await this.vault.seal(this.tokens, passphrase));
  }
  async unlock(passphrase: string): Promise<void> {
    const envelope = await this.store.read();
    if (!envelope) throw new Error("No Microsoft OneDrive credentials are saved on this device.");
    this.tokens = await this.vault.open(envelope, passphrase);
  }
  lock(): void { this.tokens = undefined; }
  async getAccessToken(passphrase?: string): Promise<string> {
    if (!this.tokens) throw new Error("Unlock Microsoft OneDrive credentials before syncing.");
    if (this.tokens.expiresAt > Date.now() + 60_000) return this.tokens.accessToken;
    if (!this.tokens.refreshToken) throw new Error("Microsoft refresh token is unavailable. Reconnect OneDrive.");
    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId, grant_type: "refresh_token", refresh_token: this.tokens.refreshToken,
        scope: "offline_access Files.ReadWrite User.Read",
      }),
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) this.lock();
      throw new Error(`Microsoft token refresh failed (${response.status}). Reconnect if access was revoked.`);
    }
    const refreshed = await response.json() as OneDriveTokenResponse;
    this.tokens = {
      ...this.tokens,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? this.tokens.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      scope: refreshed.scope ?? this.tokens.scope,
    };
    if (passphrase) await this.store.write(await this.vault.seal(this.tokens, passphrase));
    return this.tokens.accessToken;
  }
}
