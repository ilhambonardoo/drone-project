import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  downloadAndSave,
  readStoredCapture,
  validateDownloadUrl,
  assertCaptureId,
  CaptureStorageError,
} from "../../lib/captureStorage";

test("strict capture ID and download URL", () => {
  const base = "https://api.example.test/v1/mapir";
  const url = `${base}/captures/CAP-123/jpg`;
  assert.equal(validateDownloadUrl(url, "CAP-123", "jpg", base).href, url);
  for (const bad of [" CAP-123", "CAP-123 ", "CAP-123\n", "../x", "x/y"])
    assert.throws(() => assertCaptureId(bad));
  for (const bad of [
    url.replace("https:", "http:"),
    url.replace("api.example.test", "other.test"),
    url.replace("api.example.test", "api.example.test:8080"),
    `${url}?x=1`,
    `${base}/captures/OTHER/jpg`,
    `${base}/captures/CAP-123/raw`,
  ])
    assert.throws(() => validateDownloadUrl(bad, "CAP-123", "jpg", base));
});

test("stream originals, RAW pending, reuse JPG, reject redirects, verify local retry", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dreampalm-test-"));
  const prior = process.env.DREAMPALM_STORAGE_ROOT;
  process.env.DREAMPALM_STORAGE_ROOT = root;
  const jpg = Buffer.from([255, 216, 255, 224, 1, 2, 255, 217]);
  const raw = Buffer.from([1, 2, 3, 4, 5]);
  let jpgCalls = 0;
  const server = createServer((req, res) => {
    if (req.headers["x-dreampalm-key"] !== "test-key") {
      res.writeHead(401).end();
      return;
    }
    if (req.url?.includes("CAP-REDIRECT")) {
      res.writeHead(302, { location: "/never" }).end();
      return;
    }
    if (req.url?.endsWith("/jpg")) {
      jpgCalls++;
      res.writeHead(200, { "Content-Type": "image/jpeg" }).end(jpg);
      return;
    }
    if (req.url?.endsWith("/raw")) {
      res
        .writeHead(200, { "Content-Type": "application/octet-stream" })
        .end(raw);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/v1/mapir`;
    const opts = {
      captureId: "CAP-123",
      jpgUrl: `${base}/captures/CAP-123/jpg`,
      apiKey: "test-key",
      apiBaseUrl: base,
    };
    await assert.rejects(
      downloadAndSave(opts),
      (e: unknown) =>
        e instanceof CaptureStorageError && e.code === "RAW_PENDING",
    );
    const result = await downloadAndSave({
      ...opts,
      rawUrl: `${base}/captures/CAP-123/raw`,
    });
    assert.equal(jpgCalls, 1);
    assert.deepEqual(
      await readFile(path.join(root, result.originalJpgPath)),
      jpg,
    );
    assert.deepEqual(await readFile(path.join(root, result.rawFilePath)), raw);
    assert.deepEqual(await readStoredCapture("CAP-123", result), result);
    await assert.rejects(
      readStoredCapture("CAP-123", { ...result, rawSizeBytes: 99 }),
    );
    assert.deepEqual(
      (await readdir(path.join(root, "captures/CAP-123"))).sort(),
      ["original.jpg", "original.raw"],
    );
    await assert.rejects(
      downloadAndSave({
        ...opts,
        captureId: "CAP-REDIRECT",
        jpgUrl: `${base}/captures/CAP-REDIRECT/jpg`,
      }),
    );
    assert.deepEqual(
      await readdir(path.join(root, "captures/CAP-REDIRECT")),
      [],
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (prior === undefined) delete process.env.DREAMPALM_STORAGE_ROOT;
    else process.env.DREAMPALM_STORAGE_ROOT = prior;
    await rm(root, { recursive: true, force: true });
  }
});
