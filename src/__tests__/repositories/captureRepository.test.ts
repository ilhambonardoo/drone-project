import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkCaptureDatabase,
  fillCaptureMetadata,
  getCaptureById,
  insertCapture,
  updateCaptureStatus,
  updateCaptureStored,
} from "../../repositories/captureRepository";
import {
  getLatestPrediction,
  getPredictionByCaptureId,
  insertPrediction,
} from "../../repositories/predictionRepository";
import { mediaExists } from "../../repositories/mediaRepository";
import type { RepositoryDb } from "../../repositories/database";
import type {
  InsertPredictionInput,
  UpdateCaptureStoredInput,
} from "../../models";
import { parseSafeBytes, validateCaptureId } from "../../validators/captureValidator";

const CAPTURE_ID = "CAP-20261121-041023-F837";
const PREDICTION_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const storedInput: UpdateCaptureStoredInput = {
  captureId: CAPTURE_ID,
  originalJpgPath: `captures/${CAPTURE_ID}/original.jpg`,
  rawFilePath: `captures/${CAPTURE_ID}/original.raw`,
  jpgSizeBytes: 3_451_130,
  rawSizeBytes: 18_000_000,
};
const capture = {
  capture_id: CAPTURE_ID,
  drone_id: null,
  created_at: new Date(),
  captured_at: null,
  raw_file_path: storedInput.rawFilePath,
  original_jpg_path: storedInput.originalJpgPath,
  raw_size_bytes: BigInt(storedInput.rawSizeBytes),
  jpg_size_bytes: BigInt(storedInput.jpgSizeBytes),
  status: "stored",
  error_message: null,
};
const predictionInput: InsertPredictionInput = {
  predictionId: PREDICTION_ID,
  captureId: CAPTURE_ID,
  processedJpgPath: `predictions/${PREDICTION_ID}/processed.jpg`,
  ndviVisualPath: `predictions/${PREDICTION_ID}/ndvi.png`,
  classification: "Sehat",
  classIndex: 0,
  predictionScore: 0.912,
  scoreTerserang: 0.088,
  scoreSehat: 0.912,
  threshold: 0.5,
  ndvi: 0.421,
  greenMeanScaled: 0.3102,
  redMeanScaled: 0.1874,
  nirMeanScaled: 0.622,
  modelName: "dreampalm-cnn-v3",
  modelStatus: "production",
  scoreCalibrated: false,
  radiometricMode: "jpg_approximate",
  radiometricValidated: false,
  physicalCoverageTargetM: 25,
  physicalCoverageValidated: false,
  validPixelPercentage: 98.5,
  automaticSprayingAllowed: false,
  preprocessingVersion: null,
  modelSha256: null,
  configSha256: null,
};

function mockDb(results: Record<string, unknown> = {}) {
  const calls: { method: string; args: unknown }[] = [];
  const call = (method: string) => async (args: unknown) => {
    calls.push({ method, args });
    return results[method] ?? null;
  };
  const db = {
    capture: {
      findUnique: call("capture.findUnique"),
      findFirst: call("capture.findFirst"),
      createMany: call("capture.createMany"),
      updateMany: call("capture.updateMany"),
    },
    prediction: {
      findFirst: call("prediction.findFirst"),
      create: call("prediction.create"),
    },
  } as unknown as RepositoryDb;
  return { db, calls };
}

describe("capture validators", () => {
  it("accepts safe capture IDs and rejects empty, long, or path-like IDs", () => {
    for (const value of [CAPTURE_ID, "cap_123_abc", "simpleId"]) {
      assert.doesNotThrow(() => validateCaptureId(value));
    }
    for (const value of ["", " ", "../bad", "a/b", "x".repeat(129)]) {
      assert.throws(() => validateCaptureId(value), /captureId tidak valid/);
    }
  });

  it("converts BIGINT bytes only when the value is a safe non-negative integer", () => {
    for (const value of [null, undefined]) {
      assert.equal(parseSafeBytes(value), null);
    }
    for (const value of [0, 18, "18", " 18456000 ", BigInt(18)]) {
      assert.equal(parseSafeBytes(value), Number(value));
    }
    for (const value of [
      -1,
      "-1",
      BigInt(-1),
      NaN,
      Infinity,
      1.2,
      "abc",
      "9007199254740992",
    ]) {
      assert.throws(() => parseSafeBytes(value));
    }
  });
});

describe("capture repository", () => {
  it("checks database readiness and creates pending captures idempotently", async () => {
    const { db, calls } = mockDb();
    await checkCaptureDatabase(db);
    await insertCapture({ captureId: CAPTURE_ID }, db);
    assert.deepEqual(calls, [
      {
        method: "capture.findFirst",
        args: { select: { capture_id: true } },
      },
      {
        method: "capture.createMany",
        args: {
          data: [
            {
              capture_id: CAPTURE_ID,
              drone_id: null,
              captured_at: null,
              status: "pending",
            },
          ],
          skipDuplicates: true,
        },
      },
    ]);
  });

  it("validates before writing and returns capture records without BIGINT", async () => {
    const { db, calls } = mockDb({ "capture.findUnique": capture });
    await assert.rejects(insertCapture({ captureId: "../bad" }, db));
    const row = await getCaptureById(CAPTURE_ID, db);
    assert.equal(row?.raw_size_bytes, 18_000_000);
    assert.equal(row?.jpg_size_bytes, 3_451_130);
    assert.doesNotThrow(() => JSON.stringify(row));
    assert.equal(calls.length, 1);
    assert.equal(await getCaptureById("missing", mockDb().db), null);
  });

  it("updates stored metadata only for validated paths and positive safe sizes", async () => {
    const { db, calls } = mockDb({ "capture.updateMany": { count: 1 } });
    await updateCaptureStored(storedInput, db);
    assert.deepEqual(calls[0], {
      method: "capture.updateMany",
      args: {
        where: { capture_id: CAPTURE_ID },
        data: {
          status: "stored",
          original_jpg_path: storedInput.originalJpgPath,
          raw_file_path: storedInput.rawFilePath,
          jpg_size_bytes: BigInt(storedInput.jpgSizeBytes),
          raw_size_bytes: BigInt(storedInput.rawSizeBytes),
          error_message: null,
        },
      },
    });

    for (const changes of [
      { originalJpgPath: "" },
      { rawFilePath: "../raw" },
      { jpgSizeBytes: 0 },
      { rawSizeBytes: -1 },
      { jpgSizeBytes: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      await assert.rejects(
        updateCaptureStored({ ...storedInput, ...changes }, db),
      );
    }
    assert.equal(calls.length, 1);
  });

  it("updates only pending or failed status and errors when no row matches", async () => {
    const { db, calls } = mockDb({ "capture.updateMany": { count: 1 } });
    await updateCaptureStatus(CAPTURE_ID, "failed", "error", db);
    await updateCaptureStatus(CAPTURE_ID, "pending", null, db);
    assert.equal(calls.length, 2);
    await assert.rejects(
      updateCaptureStatus(CAPTURE_ID, "stored" as "pending", null, db),
      /Status tidak valid/,
    );
    await assert.rejects(
      updateCaptureStatus(
        CAPTURE_ID,
        "failed",
        null,
        mockDb({ "capture.updateMany": { count: 0 } }).db,
      ),
      /tidak ditemukan/,
    );
  });

  it("fills metadata only when the stored columns are NULL", async () => {
    const { db, calls } = mockDb({ "capture.updateMany": { count: 1 } });
    const capturedAt = new Date();
    await fillCaptureMetadata(
      CAPTURE_ID,
      { droneId: "drone", capturedAt },
      db,
    );
    assert.deepEqual(calls.map((call) => call.args), [
      {
        where: { capture_id: CAPTURE_ID, drone_id: null },
        data: { drone_id: "drone" },
      },
      {
        where: { capture_id: CAPTURE_ID, captured_at: null },
        data: { captured_at: capturedAt },
      },
    ]);
  });
});

describe("prediction repository", () => {
  it("inserts all prediction fields and queries deterministically", async () => {
    const { db, calls } = mockDb();
    await insertPrediction(predictionInput, db);
    const data = (calls[0].args as { data: Record<string, unknown> }).data;
    assert.equal(Object.keys(data).length, 26);
    for (const [key, value] of Object.entries(predictionInput)) {
      const field = key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
      assert.equal(data[field], value, field);
    }

    await getPredictionByCaptureId(CAPTURE_ID, db);
    assert.deepEqual(calls[1].args, {
      where: { capture_id: CAPTURE_ID },
      orderBy: [{ created_at: "desc" }, { prediction_id: "desc" }],
    });
  });

  it("returns latest prediction with capture metadata and no BigInt values", async () => {
    const prediction = {
      ...Object.fromEntries(
        Object.entries(predictionInput).map(([key, value]) => [
          key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`),
          value,
        ]),
      ),
      created_at: new Date(),
      capture,
    };
    const { db, calls } = mockDb({ "prediction.findFirst": prediction });
    const result = await getLatestPrediction(db);
    assert.equal(result?.prediction_id, PREDICTION_ID);
    assert.equal(result?.capture_status, "stored");
    assert.equal(result?.raw_size_bytes, 18_000_000);
    assert.doesNotThrow(() => JSON.stringify(result));
    assert.deepEqual(calls[0].args, {
      include: { capture: true },
      orderBy: [{ created_at: "desc" }, { prediction_id: "desc" }],
    });
  });

  it("returns null when no prediction exists", async () => {
    assert.equal(await getLatestPrediction(mockDb().db), null);
  });
});

describe("media repository", () => {
  it("authorizes only paths recorded for stored captures or predictions", async () => {
    const { db, calls } = mockDb({
      "capture.findFirst": { capture_id: CAPTURE_ID },
      "prediction.findFirst": null,
    });
    assert.equal(
      await mediaExists(
        "captures",
        CAPTURE_ID,
        storedInput.originalJpgPath,
        db,
      ),
      true,
    );
    assert.deepEqual(calls[0].args, {
      where: {
        capture_id: CAPTURE_ID,
        status: "stored",
        OR: [
          { original_jpg_path: storedInput.originalJpgPath },
          { raw_file_path: storedInput.originalJpgPath },
        ],
      },
      select: { capture_id: true },
    });
    assert.equal(
      await mediaExists("predictions", PREDICTION_ID, "missing", db),
      false,
    );
  });
});
