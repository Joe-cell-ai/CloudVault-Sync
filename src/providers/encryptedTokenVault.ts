export interface StoredTokenEnvelope {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface TokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
}

const ITERATIONS = 310_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (passphrase.length < 12) throw new Error("Use an encryption passphrase with at least 12 characters.");
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: asArrayBuffer(salt), iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts provider tokens before they are written to plugin data.
 * The passphrase is supplied at runtime and is never retained by this class.
 */
export class EncryptedTokenVault {
  async seal(tokens: TokenBundle, passphrase: string): Promise<StoredTokenEnvelope> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asArrayBuffer(iv) },
      key,
      encoder.encode(JSON.stringify(tokens)),
    );
    return {
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: ITERATIONS,
      salt: encode(salt),
      iv: encode(iv),
      ciphertext: encode(new Uint8Array(ciphertext)),
    };
  }

  async open(envelope: StoredTokenEnvelope, passphrase: string): Promise<TokenBundle> {
    if (envelope.version !== 1 || envelope.kdf !== "PBKDF2-SHA256" || envelope.iterations !== ITERATIONS) {
      throw new Error("Unsupported encrypted token format.");
    }
    const key = await deriveKey(passphrase, decode(envelope.salt));
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: asArrayBuffer(decode(envelope.iv)) },
        key,
        decode(envelope.ciphertext),
      );
      const value = JSON.parse(decoder.decode(plaintext)) as TokenBundle;
      if (!value.accessToken || !Number.isFinite(value.expiresAt)) throw new Error("Invalid token payload.");
      return value;
    } catch {
      throw new Error("Could not unlock provider tokens. Check the passphrase.");
    }
  }
}
