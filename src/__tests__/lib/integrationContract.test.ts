import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseMediaPath,
  resolveMediaFile,
  toMediaUrl,
} from "../../lib/mediaUrl";
import { validatePrediction, processSnapshot } from "../../lib/inferenceClient";
import { assertSameOrigin } from "../../lib/mapirClient";
import { createServer } from "node:http";
const id = "CAP-20261121-041023-F837";
const uuid = "8ea1ad6d-788e-41a9-b76b-06d0481a58fa";
const fixture = {
  success: true,
  predictionId: uuid,
  processedJpgPath: `predictions/${uuid}/processed.jpg`,
  ndviVisualPath: `predictions/${uuid}/ndvi.png`,
  classification: "Sehat",
  classIndex: 0,
  predictionScore: 0.999234,
  scoreSehat: 0.999234,
  scoreTerserang: 0.000766,
  threshold: 0.5,
  ndvi: 0.60177,
  bands: { green: 0.352941, red: 0.176471, nir: 0.709804 },
  modelName: "DreamPalm_CNN_720_AreaLuar",
  modelStatus: "prototype_exploratory",
  scoreCalibrated: false,
  radiometricMode: "mapir_jpg_div255_provisional",
  radiometricValidated: false,
  physicalCoverageTargetMeters: 10,
  physicalCoverageValidated: false,
  validPixelPercentage: 100,
  automaticSprayingAllowed: false,
};
test("strict media paths and FastAPI metadata contract", () => {
  assert.equal(
    toMediaUrl(`captures/${id}/original.raw`),
    `/api/media/captures/${id}/original.raw`,
  );
  for (const bad of [
    "captures/../original.jpg",
    `captures/${id}/ndvi.png`,
    `predictions/${uuid}/original.raw`,
    "captures/a%2Fb/original.jpg",
    "captures/a\\b/original.jpg",
  ])
    assert.throws(() => parseMediaPath(bad));
  assert.equal(validatePrediction(fixture, id).greenMeanScaled, 0.352941);
  assert.equal(validatePrediction(fixture, id).modelSha256, null);
  assert.throws(() =>
    validatePrediction({ ...fixture, classification: "Terserang" }, id),
  );
  assert.throws(() =>
    validatePrediction({ ...fixture, predictionScore: 1.1 }, id),
  );
  assert.throws(() =>
    validatePrediction({ ...fixture, processedJpgPath: "/etc/passwd" }, id),
  );
  assert.throws(() =>
    validatePrediction({ ...fixture, automaticSprayingAllowed: true }, id),
  );
});
test("mutating browser requests require same origin", () => {
  const url = "https://uji.example.test/api/mapir/capture";
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request(url, {
        method: "POST",
        headers: { origin: "https://uji.example.test" },
      }),
    ),
  );
  assert.throws(() =>
    assertSameOrigin(
      new Request(url, {
        method: "POST",
        headers: { origin: "https://other.test" },
      }),
    ),
  );
  assert.throws(() => assertSameOrigin(new Request(url, { method: "POST" })));
});
test("mock FastAPI receives original JPG multipart and returns local output files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dp-contract-"));
  const previousRoot = process.env.DREAMPALM_STORAGE_ROOT;
  const previousUrl = process.env.FASTAPI_URL;
  process.env.DREAMPALM_STORAGE_ROOT = root;
  const jpg = Buffer.from([255, 216, 255, 1, 2, 3, 255, 217]);
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    if (
      req.method !== "POST" ||
      req.url !== "/process-snapshot" ||
      !body.includes(jpg) ||
      !body.includes('name="file"')
    ) {
      res.statusCode = 400;
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(fixture));
  });
  try {
    await mkdir(path.join(root, "captures", id), { recursive: true });
    await mkdir(path.join(root, "predictions", uuid), { recursive: true });
    await writeFile(path.join(root, "captures", id, "original.jpg"), jpg);
    await writeFile(path.join(root, fixture.processedJpgPath), jpg);
    await writeFile(
      path.join(root, fixture.ndviVisualPath),
      Buffer.from([1, 2, 3]),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    process.env.FASTAPI_URL = `http://127.0.0.1:${address.port}`;
    assert.equal(
      (await processSnapshot(id, `captures/${id}/original.jpg`)).predictionId,
      uuid,
    );
    await rm(path.join(root, fixture.ndviVisualPath));
    await assert.rejects(processSnapshot(id, `captures/${id}/original.jpg`));
    if (process.platform !== "win32") {
      await symlink(
        path.join(root, "captures", id, "original.jpg"),
        path.join(root, fixture.ndviVisualPath),
      );
      await assert.rejects(resolveMediaFile(fixture.ndviVisualPath));
    }
  } finally {
    if (server.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousRoot === undefined) delete process.env.DREAMPALM_STORAGE_ROOT;
    else process.env.DREAMPALM_STORAGE_ROOT = previousRoot;
    if (previousUrl === undefined) delete process.env.FASTAPI_URL;
    else process.env.FASTAPI_URL = previousUrl;
    await rm(root, { recursive: true, force: true });
  }
});
