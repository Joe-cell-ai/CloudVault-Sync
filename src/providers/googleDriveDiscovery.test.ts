import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GoogleDriveDiscovery } from "./googleDriveDiscovery";

describe("GoogleDriveDiscovery", () => {
  it("lists only files with the CloudVault encrypted metadata", async () => {
    let requested = "";
    const discovery = new GoogleDriveDiscovery(async () => "test-token", async (input, init) => {
      requested = String(input);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-token");
      return new Response(JSON.stringify({
        files: [
          { id: "encrypted-1", name: "cloudvault-abcd", modifiedTime: "2026-11-22T00:00:00Z", size: "42",
            appProperties: { cloudvaultEncrypted: "1", cloudvaultFormat: "1", cloudvaultPathHash: "hash-1" } },
          { id: "plain-1", name: "notes.md", appProperties: {} },
          { id: "incomplete-1", name: "cloudvault-x", appProperties: { cloudvaultEncrypted: "1" } },
        ],
      }), { status: 200 });
    });
    const page = await discovery.listEncryptedFiles("folder-1");
    assert.equal(page.files.length, 1);
    assert.deepEqual(page.files[0], {
      id: "encrypted-1", opaqueName: "cloudvault-abcd", pathHash: "hash-1",
      modifiedTime: "2026-11-22T00:00:00Z", size: 42,
    });
    assert.match(requested, /appProperties/);
    assert.match(requested, /trashed/);
  });

  it("follows page tokens until all encrypted files are found", async () => {
    const tokens: string[] = [];
    const discovery = new GoogleDriveDiscovery(async () => "token", async input => {
      const url = new URL(String(input));
      const pageToken = url.searchParams.get("pageToken") ?? "";
      tokens.push(pageToken);
      const id = pageToken ? "second" : "first";
      return new Response(JSON.stringify({
        files: [{ id, name: "cloudvault-" + id, appProperties: {
          cloudvaultFormat: "1", cloudvaultPathHash: "hash-" + id,
        }}],
        ...(pageToken ? {} : { nextPageToken: "next-page" }),
      }), { status: 200 });
    });
    const files = await discovery.listAllEncryptedFiles("folder");
    assert.deepEqual(files.map(file => file.id), ["first", "second"]);
    assert.deepEqual(tokens, ["", "next-page"]);
  });

  it("rejects an empty folder ID", async () => {
    const discovery = new GoogleDriveDiscovery(async () => "token");
    await assert.rejects(() => discovery.listEncryptedFiles("  "), /folder is required/i);
  });
});
