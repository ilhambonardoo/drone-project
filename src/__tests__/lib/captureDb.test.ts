/**
 * @file src/__tests__/lib/captureDb.test.ts
 * @description Unit test untuk captureDb.ts menggunakan mock PoolClient dan node:test.
 *
 * Menguji validasi runtime ketat, pemeriksaan rowCount, konversi BIGINT terkontrol,
 * idempotensi, dan kepatuhan schema uji.
 *
 * Menjalankan pengujian:
 *   node --loader ./src/__tests__/test-resolver.mjs --experimental-strip-types --test src/__tests__/lib/captureDb.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  insertCapture,
  getCaptureById,
  updateCaptureStored,
  updateCaptureStatus,
  getPredictionByCaptureId,
  insertPrediction,
  getLatestPrediction,
  parseSafeBytes,
  validateCaptureId,
} from "../../lib/captureDb";
import type {
  InsertCaptureInput,
  UpdateCaptureStoredInput,
  InsertPredictionInput,
  PredictionRecord,
} from "../../lib/captureDb";
import type { PoolClient, QueryResult } from "pg";

/** Helper untuk membuat mock PoolClient dengan konfigurasi queryResult tertentu. */
function createMockClient(options: {
  rows?: unknown[];
  rowCount?: number;
  throwError?: Error;
} = {}) {
  const { rows = [], rowCount = rows.length, throwError } = options;
  const calls: { text: string; params: unknown[] | undefined }[] = [];
  let released = false;
  let releaseParam: boolean | undefined;

  const client = {
    query: async (text: string, params?: unknown[]): Promise<QueryResult> => {
      calls.push({ text, params });
      if (throwError) {
        throw throwError;
      }
      return {
        rows,
        rowCount,
        command: "MOCK",
        oid: 0,
        fields: [],
      };
    },
    release: (destroy?: boolean) => {
      released = true;
      releaseParam = destroy;
    },
  } as unknown as PoolClient;

  return {
    client,
    calls,
    isReleased: () => released,
    getReleaseParam: () => releaseParam,
  };
}

const FIXTURE_CAPTURE_ID = "CAP-20261121-041023-F837";
const FIXTURE_PREDICTION_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

const FIXTURE_PREDICTION_INPUT: InsertPredictionInput = {
  predictionId: FIXTURE_PREDICTION_ID,
  captureId: FIXTURE_CAPTURE_ID,
  processedJpgPath: `predictions/${FIXTURE_PREDICTION_ID}/processed.jpg`,
  ndviVisualPath: `predictions/${FIXTURE_PREDICTION_ID}/ndvi.png`,
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
  physicalCoverageTargetM: 25.0,
  physicalCoverageValidated: false,
  validPixelPercentage: 98.5,
  automaticSprayingAllowed: false,
  preprocessingVersion: null,
  modelSha256: null,
  configSha256: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Test: validateCaptureId
// ─────────────────────────────────────────────────────────────────────────────

describe("captureDb - validateCaptureId", () => {
  it("menerima captureId valid dengan format alfanumerik, dash, dan underscore", () => {
    assert.doesNotThrow(() => validateCaptureId("CAP-20261121-041023-F837"));
    assert.doesNotThrow(() => validateCaptureId("cap_123_abc"));
    assert.doesNotThrow(() => validateCaptureId("simpleId"));
  });

  it("menolak captureId kosong atau string spasi", () => {
    assert.throws(
      () => validateCaptureId(""),
      /captureId tidak valid/,
    );
    assert.throws(
      () => validateCaptureId("   "),
      /captureId tidak valid/,
    );
  });

  it("menolak captureId dengan karakter berbahaya atau path traversal", () => {
    assert.throws(() => validateCaptureId("../etc/passwd"), /captureId tidak valid/);
    assert.throws(() => validateCaptureId("CAP; DROP TABLE"), /captureId tidak valid/);
    assert.throws(() => validateCaptureId("cap/sub"), /captureId tidak valid/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: parseSafeBytes (Konversi BIGINT Terkontrol)
// ─────────────────────────────────────────────────────────────────────────────

describe("captureDb - parseSafeBytes (Konversi BIGINT)", () => {
  it("mengembalikan null jika nilai null atau undefined", () => {
    assert.equal(parseSafeBytes(null), null);
    assert.equal(parseSafeBytes(undefined), null);
  });

  it("menerima dan mempertahankan safe integer number positif atau nol", () => {
    assert.equal(parseSafeBytes(0), 0);
    assert.equal(parseSafeBytes(1024), 1024);
    assert.equal(parseSafeBytes(18_000_000), 18_000_000);
    assert.equal(parseSafeBytes(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  });

  it("mengonversi string angka dari PostgreSQL BIGINT menjadi safe integer number", () => {
    assert.equal(parseSafeBytes("0"), 0);
    assert.equal(parseSafeBytes("3500000"), 3500000);
    assert.equal(parseSafeBytes(" 18456000 "), 18456000);
  });

  it("menolak ukuran bytes negatif", () => {
    assert.throws(() => parseSafeBytes(-1), /safe integer non-negatif/);
    assert.throws(() => parseSafeBytes("-500"), /string tidak valid/);
  });

  it("menolak ukuran bytes NaN, float, atau melebihi safe integer", () => {
    assert.throws(() => parseSafeBytes(NaN), /safe integer non-negatif/);
    assert.throws(() => parseSafeBytes(12.34), /safe integer non-negatif/);
    assert.throws(() => parseSafeBytes(Infinity), /safe integer non-negatif/);
    assert.throws(() => parseSafeBytes("999999999999999999999999999"), /di luar rentang safe integer/);
    assert.throws(() => parseSafeBytes("abc"), /string tidak valid/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: insertCapture
// ─────────────────────────────────────────────────────────────────────────────

describe("captureDb - insertCapture", () => {
  it("menggunakan parameterisasi dan menargetkan schema uji secara eksplisit", async () => {
    const { client, calls } = createMockClient({ rowCount: 1 });
    const input: InsertCaptureInput = {
      captureId: FIXTURE_CAPTURE_ID,
      droneId: "DRONE-01",
      capturedAt: new Date("2026-11-21T04:10:23Z"),
    };

    await insertCapture(input, client);

    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.ok(call.text.includes("uji.captures"), "Harus menargetkan uji.captures");
    assert.ok(!call.text.includes(FIXTURE_CAPTURE_ID), "Nilai dinamis tidak boleh di-hardcode");
    assert.deepEqual(call.params, [
      FIXTURE_CAPTURE_ID,
      "DRONE-01",
      new Date("2026-11-21T04:10:23Z"),
    ]);
  });

  it("bersifat idempoten dengan ON CONFLICT (capture_id) DO NOTHING", async () => {
    const { client, calls } = createMockClient({ rowCount: 0 });
    await insertCapture({ captureId: FIXTURE_CAPTURE_ID }, client);

    assert.ok(
      /ON CONFLICT\s*\(capture_id\)\s*DO NOTHING/i.test(calls[0].text),
      "Harus menggunakan ON CONFLICT (capture_id) DO NOTHING",
    );
  });

  it("mengisi NULL jika droneId dan capturedAt tidak disediakan", async () => {
    const { client, calls } = createMockClient({ rowCount: 1 });
    await insertCapture({ captureId: FIXTURE_CAPTURE_ID }, client);

    assert.equal(calls[0].params?.[1], null);
    assert.equal(calls[0].params?.[2], null);
  });

  it("menolak captureId tidak valid", async () => {
    const { client } = createMockClient();
    await assert.rejects(
      async () => {
        await insertCapture({ captureId: "" }, client);
      },
      /captureId tidak valid/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: getCaptureById
// ─────────────────────────────────────────────────────────────────────────────

describe("captureDb - getCaptureById", () => {
  it("menargetkan schema uji.captures dengan parameter terikat dan konversi BIGINT", async () => {
    const mockDbRow = {
      capture_id: FIXTURE_CAPTURE_ID,
      drone_id: null,
      created_at: new Date(),
      captured_at: null,
      raw_file_path: `captures/${FIXTURE_CAPTURE_ID}/original.raw`,
      original_jpg_path: `captures/${FIXTURE_CAPTURE_ID}/original.jpg`,
      // Simulasi driver pg mengembalikan BIGINT sebagai string
      raw_size_bytes: "18500000",
      jpg_size_bytes: "3400000",
      status: "stored",
      error_message: null,
    };
    const { client, calls } = createMockClient({ rows: [mockDbRow] });

    const result = await getCaptureById(FIXTURE_CAPTURE_ID, client);

    assert.equal(calls.length, 1);
    assert.ok(calls[0].text.includes("uji.captures"));
    assert.deepEqual(calls[0].params, [FIXTURE_CAPTURE_ID]);
    // Verifikasi konversi BIGINT ke number safe integer
    assert.equal(result?.raw_size_bytes, 18500000);
    assert.equal(typeof result?.raw_size_bytes, "number");
    assert.equal(result?.jpg_size_bytes, 3400000);
    assert.equal(typeof result?.jpg_size_bytes, "number");
  });

  it("mengembalikan null jika tidak ada data", async () => {
    const { client } = createMockClient({ rows: [] });
    const result = await getCaptureById(FIXTURE_CAPTURE_ID, client);
    assert.equal(result, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: updateCaptureStored (Validasi Runtime & rowCount)
// ─────────────────────────────────────────────────────────────────────────────

describe("captureDb - updateCaptureStored", () => {
  const validBaseInput: UpdateCaptureStoredInput = {
    captureId: FIXTURE_CAPTURE_ID,
    originalJpgPath: `captures/${FIXTURE_CAPTURE_ID}/original.jpg`,
    rawFilePath: `captures/${FIXTURE_CAPTURE_ID}/original.raw`,
    jpgSizeBytes: 3500000,
    rawSizeBytes: 18000000,
  };

  it("berhasil update jika input lengkap dan valid", async () => {
    const { client, calls } = createMockClient({ rowCount: 1 });

    await updateCaptureStored(validBaseInput, client);

    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.ok(call.text.includes("uji.captures"));
    assert.ok(call.text.includes("'stored'"));
    assert.deepEqual(call.params, [
      FIXTURE_CAPTURE_ID,
      validBaseInput.originalJpgPath,
      validBaseInput.rawFilePath,
      3500000,
      18000000,
    ]);
  });

  it("menolak JPG path kosong atau null", async () => {
    const { client } = createMockClient();
    await assert.rejects(
      async () => {
        await updateCaptureStored(
          { ...validBaseInput, originalJpgPath: "" },
          client,
        );
      },
      /originalJpgPath tidak valid/,
    );
  });

  it("menolak RAW path kosong atau null", async () => {
    const { client } = createMockClient();
    await assert.rejects(
      async () => {
        await updateCaptureStored(
          { ...validBaseInput, rawFilePath: "" },
          client,
        );
      },
      /rawFilePath tidak valid/,
    );
  });

  it("menolak path yang tidak sesuai dengan pola captureId", async () => {
    const { client } = createMockClient();
    // Path JPG mengarah ke captureId lain
    await assert.rejects(
      async () => {
        await updateCaptureStored(
          {
            ...validBaseInput,
            originalJpgPath: "captures/OTHER-ID/original.jpg",
          },
          client,
        );
      },
      /originalJpgPath tidak valid.*Harus bernilai/,
    );

    // Path RAW mengarah ke captureId lain
    await assert.rejects(
      async () => {
        await updateCaptureStored(
          {
            ...validBaseInput,
            rawFilePath: "captures/OTHER-ID/original.raw",
          },
          client,
        );
      },
      /rawFilePath tidak valid.*Harus bernilai/,
    );
  });

  it("menolak ukuran file nol", async () => {
    const { client } = createMockClient();
    await assert.rejects(
      async () => {
        await updateCaptureStored({ ...validBaseInput, jpgSizeBytes: 0 }, client);
      },
      /jpgSizeBytes harus merupakan bilangan bulat positif/,
    );
    await assert.rejects(
      async () => {
        await updateCaptureStored({ ...validBaseInput, rawSizeBytes: 0 }, client);
      },
      /rawSizeBytes harus merupakan bilangan bulat positif/,
    );
  });

  it("menolak ukuran file negatif", async () => {
    const { client } = createMockClient();
    await assert.rejects(
      async () => {
        await updateCaptureStored({ ...validBaseInput, jpgSizeBytes: -50 }, client);
      },
      /jpgSizeBytes harus merupakan bilangan bulat positif/,
    );
    await assert.rejects(
      async () => {
        await updateCaptureStored({ ...validBaseInput, rawSizeBytes: -1000 }, client);
      },
      /rawSizeBytes harus merupakan bilangan bulat positif/,
    );
  });

  it("menolak ukuran file NaN atau pecahan (bukan safe integer)", async () => {
    const { client } = createMockClient();
    await assert.rejects(
      async () => {
        await updateCaptureStored({ ...validBaseInput, jpgSizeBytes: NaN }, client);
      },
      /jpgSizeBytes harus merupakan bilangan bulat positif/,
    );
    await assert.rejects(
      async () => {
        await updateCaptureStored({ ...validBaseInput, rawSizeBytes: 123.456 }, client);
      },
      /rawSizeBytes harus merupakan bilangan bulat positif/,
    );
  });

  it("melempar error jika rowCount = 0 (record capture tidak ditemukan)", async () => {
    const { client } = createMockClient({ rowCount: 0 });
    await assert.rejects(
      async () => {
        await updateCaptureStored(validBaseInput, client);
      },
      /Record capture dengan ID.*tidak ditemukan untuk diperbarui/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: updateCaptureStatus (Validasi Status & rowCount)
// ─────────────────────────────────────────────────────────────────────────────

describe("captureDb - updateCaptureStatus", () => {
  it("berhasil update status 'pending' dan 'failed'", async () => {
    const { client, calls } = createMockClient({ rowCount: 1 });
    await updateCaptureStatus(FIXTURE_CAPTURE_ID, "failed", "Download error", client);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, [
      FIXTURE_CAPTURE_ID,
      "failed",
      "Download error",
    ]);
  });

  it("menolak input status 'stored' (harus menggunakan updateCaptureStored)", async () => {
    const { client } = createMockClient();
    await assert.rejects(
      async () => {
        // Casting ke any untuk menguji penolakan runtime
        // @ts-expect-error Pengujian runtime penolakan status stored
        await updateCaptureStatus(FIXTURE_CAPTURE_ID, "stored", null, client);
      },
      /Status tidak valid.*updateCaptureStatus hanya menerima "pending" atau "failed"/,
    );
  });

  it("melempar error jika rowCount = 0", async () => {
    const { client } = createMockClient({ rowCount: 0 });
    await assert.rejects(
      async () => {
        await updateCaptureStatus(FIXTURE_CAPTURE_ID, "failed", "Error", client);
      },
      /Record capture dengan ID.*tidak ditemukan untuk diperbarui/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: getPredictionByCaptureId & insertPrediction
// ─────────────────────────────────────────────────────────────────────────────

describe("captureDb - getPredictionByCaptureId & insertPrediction", () => {
  it("getPredictionByCaptureId menggunakan ORDER BY created_at DESC LIMIT 1", async () => {
    const mockRow: Partial<PredictionRecord> = {
      prediction_id: FIXTURE_PREDICTION_ID,
      capture_id: FIXTURE_CAPTURE_ID,
      classification: "Sehat",
    };
    const { client, calls } = createMockClient({ rows: [mockRow] });

    const result = await getPredictionByCaptureId(client, FIXTURE_CAPTURE_ID);

    assert.equal(calls.length, 1);
    assert.ok(calls[0].text.includes("uji.predictions"));
    assert.ok(
      /ORDER BY[\s\S]*created_at DESC[\s\S]*prediction_id DESC/i.test(
        calls[0].text,
      ),
    );
    assert.equal(result?.prediction_id, FIXTURE_PREDICTION_ID);
  });

  it("insertPrediction memetakan 26 field tanpa ON CONFLICT", async () => {
    const { client, calls } = createMockClient({ rowCount: 1 });

    await insertPrediction(client, FIXTURE_PREDICTION_INPUT);

    assert.equal(calls.length, 1);
    assert.ok(calls[0].text.includes("uji.predictions"));
    assert.ok(!calls[0].text.includes("ON CONFLICT"));
    assert.equal(calls[0].params?.length, 26);
    assert.equal(calls[0].params?.[0], FIXTURE_PREDICTION_ID);
    assert.equal(calls[0].params?.[1], FIXTURE_CAPTURE_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: getLatestPrediction
// ─────────────────────────────────────────────────────────────────────────────

describe("captureDb - getLatestPrediction", () => {
  it("mengembalikan null jika tabel kosong", async () => {
    const { client } = createMockClient({ rows: [] });
    const result = await getLatestPrediction(client);
    assert.equal(result, null);
  });

  it("mengembalikan row lengkap dengan alias kolom dan konversi BIGINT", async () => {
    const mockRow = {
      prediction_id: FIXTURE_PREDICTION_ID,
      capture_id: FIXTURE_CAPTURE_ID,
      classification: "Sehat",
      capture_created_at: new Date(),
      capture_status: "stored",
      jpg_size_bytes: "3400000",
      raw_size_bytes: "18500000",
    };
    const { client, calls } = createMockClient({ rows: [mockRow] });

    const result = await getLatestPrediction(client);

    assert.equal(calls.length, 1);
    assert.ok(calls[0].text.includes("JOIN uji.captures"));
    assert.equal(result?.jpg_size_bytes, 3400000);
    assert.equal(typeof result?.jpg_size_bytes, "number");
    assert.equal(result?.raw_size_bytes, 18500000);
    assert.equal(typeof result?.raw_size_bytes, "number");
  });
});
