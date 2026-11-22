const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid"];

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export interface GoogleOAuthPending {
  state: string;
  verifier: string;
  createdAt: number;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  refresh_token?: string;
}

export class GoogleDriveAuth {
  createAuthorizationUrl(clientId: string, redirectUri: string): { url: string; pending: GoogleOAuthPending } {
    if (!clientId.trim() || !redirectUri.trim()) throw new Error("Set the Google OAuth client ID and redirect URI first.");
    const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
    const stateBytes = crypto.getRandomValues(new Uint8Array(24));
    const verifier = toBase64Url(verifierBytes);
    const state = toBase64Url(stateBytes);
    const pending = { state, verifier, createdAt: Date.now() };
    const url = new URL(GOOGLE_AUTH_ENDPOINT);
    url.search = new URLSearchParams({
      client_id: clientId.trim(),
      redirect_uri: redirectUri.trim(),
      response_type: "code",
      scope: SCOPES.join(" "),
      code_challenge: toBase64Url(await sha256(verifier)),
      code_challenge_method: "S256",
      state,
      access_type: "offline",
      include_granted_scopes: "true",
    }).toString();
    return { url: url.toString(), pending };
  }

  async exchangeCode(code: string, clientId: string, redirectUri: string, verifier: string): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    });
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error(`Google token exchange failed (${response.status}).`);
    return await response.json() as GoogleTokenResponse;
  }
}
