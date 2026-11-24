const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const SCOPES = ["offline_access", "Files.ReadWrite", "User.Read"];

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
export interface OneDrivePendingAuth { state: string; verifier: string; createdAt: number; }
export interface OneDriveTokenResponse { access_token: string; refresh_token?: string; expires_in: number; token_type: string; scope?: string; }

/** OAuth 2.0 authorization-code + PKCE; no client secret is embedded in the plugin. */
export class OneDriveAuth {
  async createAuthorizationUrl(clientId: string, redirectUri: string): Promise<{ url: string; pending: OneDrivePendingAuth }> {
    if (!clientId.trim() || !redirectUri.trim()) throw new Error("Set the Microsoft application client ID and redirect URI.");
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    const url = new URL(AUTH);
    url.search = new URLSearchParams({
      client_id: clientId.trim(), response_type: "code", redirect_uri: redirectUri.trim(),
      response_mode: "query", scope: SCOPES.join(" "), code_challenge: base64Url(await digest(verifier)),
      code_challenge_method: "S256", state,
    }).toString();
    return { url: url.toString(), pending: { state, verifier, createdAt: Date.now() } };
  }

  async exchangeCode(code: string, clientId: string, redirectUri: string, verifier: string): Promise<OneDriveTokenResponse> {
    const response = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, grant_type: "authorization_code", code,
        redirect_uri: redirectUri, code_verifier: verifier, scope: SCOPES.join(" "),
      }),
    });
    if (!response.ok) throw new Error(`Microsoft token exchange failed (${response.status}).`);
    return await response.json() as OneDriveTokenResponse;
  }

  async refresh(clientId: string, refreshToken: string): Promise<OneDriveTokenResponse> {
    const response = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, grant_type: "refresh_token", refresh_token: refreshToken, scope: SCOPES.join(" "),
      }),
    });
    if (!response.ok) throw new Error(`Microsoft token refresh failed (${response.status}).`);
    return await response.json() as OneDriveTokenResponse;
  }
}
