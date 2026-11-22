import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EncryptedTokenVault } from "./encryptedTokenVault";

describe("EncryptedTokenVault", () => {
  it("round-trips tokens without storing their plaintext in the envelope", async () => {
    const vault = new EncryptedTokenVault();
    const tokens = { accessToken: "access-secret", refreshToken: "refresh-secret", expiresAt: 123456789 };
    const envelope = await vault.seal(tokens, "a sufficiently long passphrase");
    assert.equal(JSON.stringify(envelope).includes("access-secret"), false);
    assert.deepEqual(await vault.open(envelope, "a sufficiently long passphrase"), tokens);
  });

  it("rejects an incorrect passphrase", async () => {
    const vault = new EncryptedTokenVault();
    const envelope = await vault.seal({ accessToken: "secret", expiresAt: 123 }, "correct passphrase long");
    await assert.rejects(() => vault.open(envelope, "incorrect passphrase"), /Could not unlock/);
  });
});
