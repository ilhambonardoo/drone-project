/** ORM data access. Preserve snake_case records for existing API contracts. */
import type { Capture, Prediction, PrismaClient } from "@prisma/client";
import { getPrisma } from "./prisma";

export type OrmDb = Pick<PrismaClient, "capture" | "prediction">;

/** Record lengkap dari tabel uji.captures. */
export interface CaptureRecord {
  capture_id: string;
  drone_id: string | null;
  created_at: Date;
  captured_at: Date | null;
  raw_file_path: string | null;
  original_jpg_path: string | null;
  /** Ukuran file dalam bytes (dikonversi terkontrol dari BIGINT). */
  raw_size_bytes: number | null;
  /** Ukuran file dalam bytes (dikonversi terkontrol dari BIGINT). */
  jpg_size_bytes: number | null;
  status: "pending" | "stored" | "failed";
  error_message: string | null;
}

/** Record lengkap dari tabel uji.predictions. */
export interface PredictionRecord {
  prediction_id: string;
  capture_id: string;
  created_at: Date;
  processed_jpg_path: string;
  ndvi_visual_path: string;
  classification: "Sehat" | "Terserang";
  class_index: 0 | 1;
  prediction_score: number;
  score_terserang: number;
  score_sehat: number;
  threshold: number;
  ndvi: number | null;
  green_mean_scaled: number | null;
  red_mean_scaled: number | null;
  nir_mean_scaled: number | null;
  model_name: string;
  model_status: string;
  score_calibrated: boolean;
  radiometric_mode: string;
  radiometric_validated: boolean;
  physical_coverage_target_m: number | null;
  physical_coverage_validated: boolean;
  valid_pixel_percentage: number | null;
  automatic_spraying_allowed: boolean;
  preprocessing_version: string | null;
  model_sha256: string | null;
  config_sha256: string | null;
}

/**
 * Hasil JOIN uji.predictions + uji.captures untuk endpoint /api/predictions/latest.
 * Kolom dari captures diberi alias untuk menghindari konflik dengan kolom predictions.
 */
export interface LatestPredictionRow extends PredictionRecord {
  /** created_at dari uji.captures (bukan uji.predictions). */
  capture_created_at: Date;
  drone_id: string | null;
  captured_at: Date | null;
  original_jpg_path: string | null;
  raw_file_path: string | null;
  jpg_size_bytes: number | null;
  raw_size_bytes: number | null;
  capture_status: "pending" | "stored" | "failed";
}

/** Input untuk fungsi insertCapture. */
export interface InsertCaptureInput {
  captureId: string;
  /** NULL jika tidak tersedia dari response Capture API. */
  droneId?: string | null;
  /** NULL jika tidak tersedia dari response Capture API. */
  capturedAt?: Date | null;
}

/**
 * Input untuk fungsi updateCaptureStored.
 * Status 'stored' hanya diberikan jika JPG DAN RAW asli berhasil tersimpan.
 * Kedua path dan ukuran wajib diisi dengan format relatif yang sah.
 */
export interface UpdateCaptureStoredInput {
  captureId: string;
  originalJpgPath: string;
  rawFilePath: string;
  jpgSizeBytes: number;
  rawSizeBytes: number;
}

/**
 * Input untuk fungsi insertPrediction.
 * Memetakan field response FastAPI ke kolom uji.predictions.
 */
export interface InsertPredictionInput {
  /** UUID dari response FastAPI, bukan dibuat oleh Next.js. */
  predictionId: string;
  captureId: string;
  /** Relative path dari storage root. Contoh: predictions/<uuid>/processed.jpg */
  processedJpgPath: string;
  /** Relative path dari storage root. Contoh: predictions/<uuid>/ndvi.png */
  ndviVisualPath: string;
  classification: "Sehat" | "Terserang";
  classIndex: 0 | 1;
  predictionScore: number;
  scoreTerserang: number;
  scoreSehat: number;
  threshold: number;
  ndvi: number | null;
  greenMeanScaled: number | null;
  redMeanScaled: number | null;
  nirMeanScaled: number | null;
  modelName: string;
  modelStatus: string;
  scoreCalibrated: boolean;
  radiometricMode: string;
  radiometricValidated: boolean;
  physicalCoverageTargetM: number | null;
  physicalCoverageValidated: boolean;
  validPixelPercentage: number | null;
  automaticSprayingAllowed: boolean;
  /** NULL — belum tersedia pada response FastAPI saat ini. */
  preprocessingVersion: string | null;
  /** NULL — belum tersedia pada response FastAPI saat ini. */
  modelSha256: string | null;
  /** NULL — belum tersedia pada response FastAPI saat ini. */
  configSha256: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fungsi Validasi & Konversi Terkontrol
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memvalidasi string captureId.
 * Harus berupa string non-kosong dan hanya berisi alfanumerik, dash, atau underscore.
 */
export function validateCaptureId(captureId: string): void {
  if (
    !captureId ||
    typeof captureId !== "string" ||
    captureId.length > 128 ||
    /[^A-Za-z0-9_-]/.test(captureId)
  ) {
    throw new Error(
      `captureId tidak valid: "${captureId}". Harus berupa string non-kosong dan hanya berisi karakter alfanumerik, dash (-), atau underscore (_).`,
    );
  }
}

/**
 * Mengonversi nilai BIGINT dari database secara terkontrol ke tipe number aman JavaScript.
 * Mencegah overflow integer dan memastikan nilai berada pada rentang yang valid (non-negatif safe integer).
 */
export function parseSafeBytes(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        `Ukuran bytes tidak valid (harus safe integer non-negatif): ${value}`,
      );
    }
    return value;
  }

  if (typeof value === "bigint") {
    return parseSafeBytes(value.toString());
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Ukuran bytes string tidak valid: "${value}"`);
    }
    const num = Number(trimmed);
    if (!Number.isSafeInteger(num) || num < 0) {
      throw new Error(
        `Ukuran bytes di luar rentang safe integer JavaScript: "${value}"`,
      );
    }
    return num;
  }

  throw new Error(`Tipe data ukuran bytes tidak dikenali: ${typeof value}`);
}

function captureRecord(row: Capture): CaptureRecord {
  if (row.status !== "pending" && row.status !== "stored" && row.status !== "failed") {
    throw new Error("Status capture database tidak valid.");
/**
 * Menjalankan query SELECT baik melalui dedicated PoolClient (jika diberikan)
 * atau melalui pool query umum (jika client bernilai undefined).
 */
async function executeQuery<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient | undefined,
  text: string,
  params?: unknown[],
): Promise<T[]> {
  if (client) {
    const res = await client.query<T>(text, params);
    return res.rows;
  }
  return { ...row, status: row.status,
    jpg_size_bytes: parseSafeBytes(row.jpg_size_bytes),
    raw_size_bytes: parseSafeBytes(row.raw_size_bytes) };
}
    
function predictionRecord(row: Prediction): PredictionRecord {
  if ((row.classification !== "Sehat" && row.classification !== "Terserang") ||
      (row.class_index !== 0 && row.class_index !== 1)) {
    throw new Error("Klasifikasi database tidak valid.");

async function executeMutation<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient | undefined,
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  if (client) {
    return client.query<T>(text, params);
  }
  return { ...row, classification: row.classification, class_index: row.class_index };
}
const orm = (db?: OrmDb): OrmDb => db ?? getPrisma();

export async function checkCaptureDatabase(db?: OrmDb): Promise<void> {
  await orm(db).capture.findFirst({ select: { capture_id: true } });
}

export async function insertCapture(input: InsertCaptureInput, db?: OrmDb): Promise<void> {
  validateCaptureId(input.captureId);
  // createMany(skipDuplicates) preserves existing ON CONFLICT DO NOTHING semantics.
  await orm(db).capture.createMany({ data: [{ capture_id: input.captureId,
    drone_id: input.droneId ?? null, captured_at: input.capturedAt ?? null, status: "pending" }], skipDuplicates: true });
}

export async function getCaptureById(captureId: string, db?: OrmDb): Promise<CaptureRecord | null> {
  validateCaptureId(captureId);
  const row = await orm(db).capture.findUnique({ where: { capture_id: captureId } });
  return row ? captureRecord(row) : null;
}

/** Fill only missing metadata, never overwrite existing values (former COALESCE). */
export async function fillCaptureMetadata(captureId: string, metadata: Omit<InsertCaptureInput, "captureId">, db?: OrmDb): Promise<void> {
  validateCaptureId(captureId);
  const client = orm(db);
  if (metadata.droneId != null) await client.capture.updateMany({
    where: { capture_id: captureId, drone_id: null }, data: { drone_id: metadata.droneId },
  });
  if (metadata.capturedAt != null) await client.capture.updateMany({
    where: { capture_id: captureId, captured_at: null }, data: { captured_at: metadata.capturedAt },
  });
}

export async function updateCaptureStored(input: UpdateCaptureStoredInput, db?: OrmDb): Promise<void> {
  const { captureId, originalJpgPath, rawFilePath, jpgSizeBytes, rawSizeBytes } = input;
  // 1. Validasi captureId
  validateCaptureId(captureId);

  // 2. Validasi format path relatif yang diizinkan
  const expectedJpgPath = `captures/${captureId}/original.jpg`;
  const expectedRawPath = `captures/${captureId}/original.raw`;

  if (!originalJpgPath || originalJpgPath !== expectedJpgPath) {
    throw new Error(
      `originalJpgPath tidak valid: "${originalJpgPath}". Harus bernilai "${expectedJpgPath}".`,
    );
  }

  if (!rawFilePath || rawFilePath !== expectedRawPath) {
    throw new Error(
      `rawFilePath tidak valid: "${rawFilePath}". Harus bernilai "${expectedRawPath}".`,
    );
  }

  // 3. Validasi ukuran bytes (harus bilangan bulat positif safe integer)
  if (
    typeof jpgSizeBytes !== "number" ||
    !Number.isSafeInteger(jpgSizeBytes) ||
    jpgSizeBytes <= 0
  ) {
    throw new Error(
      `jpgSizeBytes harus merupakan bilangan bulat positif yang aman (safe integer): ${jpgSizeBytes}`,
    );
  }

  if (
    typeof rawSizeBytes !== "number" ||
    !Number.isSafeInteger(rawSizeBytes) ||
    rawSizeBytes <= 0
  ) {
    throw new Error(
      `rawSizeBytes harus merupakan bilangan bulat positif yang aman (safe integer): ${rawSizeBytes}`,
    );
  }


  const result = await orm(db).capture.updateMany({ where: { capture_id: captureId }, data: {
    status: "stored", original_jpg_path: originalJpgPath, raw_file_path: rawFilePath,
    jpg_size_bytes: BigInt(jpgSizeBytes), raw_size_bytes: BigInt(rawSizeBytes), error_message: null,
  } });
  if (!result.count) throw new Error(`Record capture dengan ID "${captureId}" tidak ditemukan untuk diperbarui.`);
}

export async function updateCaptureStatus(captureId: string, status: "pending" | "failed", errorMessage?: string | null, db?: OrmDb): Promise<void> {
  validateCaptureId(captureId);
  if (status !== "pending" && status !== "failed") throw new Error("Status tidak valid.");
  const result = await orm(db).capture.updateMany({ where: { capture_id: captureId }, data: { status, error_message: errorMessage ?? null } });
  if (!result.count) throw new Error(`Record capture dengan ID "${captureId}" tidak ditemukan untuk diperbarui.`);
}

export async function getPredictionByCaptureId(captureId: string, db?: OrmDb): Promise<PredictionRecord | null> {
  validateCaptureId(captureId);
  const row = await orm(db).prediction.findFirst({ where: { capture_id: captureId }, orderBy: [{ created_at: "desc" }, { prediction_id: "desc" }] });
  return row ? predictionRecord(row) : null;
}

/** Append-only, caller must hold the existing per-capture advisory lock. */
export async function insertPrediction(input: InsertPredictionInput, db?: OrmDb): Promise<void> {
  validateCaptureId(input.captureId);
  await orm(db).prediction.create({ data: {
      prediction_id: input.predictionId,
      capture_id: input.captureId,
      processed_jpg_path: input.processedJpgPath,
      ndvi_visual_path: input.ndviVisualPath,
      classification: input.classification,
      class_index: input.classIndex,
      prediction_score: input.predictionScore,
      score_terserang: input.scoreTerserang,
      score_sehat: input.scoreSehat,
      threshold: input.threshold,
      ndvi: input.ndvi,
      green_mean_scaled: input.greenMeanScaled,
      red_mean_scaled: input.redMeanScaled,
      nir_mean_scaled: input.nirMeanScaled,
      model_name: input.modelName,
      model_status: input.modelStatus,
      score_calibrated: input.scoreCalibrated,
      radiometric_mode: input.radiometricMode,
      radiometric_validated: input.radiometricValidated,
      physical_coverage_target_m: input.physicalCoverageTargetM,
      physical_coverage_validated: input.physicalCoverageValidated,
      valid_pixel_percentage: input.validPixelPercentage,
      automatic_spraying_allowed: input.automaticSprayingAllowed,
      preprocessing_version: input.preprocessingVersion,
      model_sha256: input.modelSha256,
      config_sha256: input.configSha256,
  } });
}

export async function getLatestPrediction(db?: OrmDb): Promise<LatestPredictionRow | null> {
  const row = await orm(db).prediction.findFirst({ include: { capture: true }, orderBy: [{ created_at: "desc" }, { prediction_id: "desc" }] });
  if (!row) return null;
  const { capture, ...prediction } = row;
  const c = captureRecord(capture);
  return { ...predictionRecord(prediction), capture_created_at: c.created_at, drone_id: c.drone_id,
    captured_at: c.captured_at, original_jpg_path: c.original_jpg_path, raw_file_path: c.raw_file_path,
    jpg_size_bytes: c.jpg_size_bytes, raw_size_bytes: c.raw_size_bytes, capture_status: c.status };
}

export async function mediaExists(group: "captures" | "predictions", id: string, relative: string, db?: OrmDb): Promise<boolean> {
  const client = orm(db);
  if (group === "captures") return Boolean(await client.capture.findFirst({ where: { capture_id: id,
    status: "stored", OR: [{ original_jpg_path: relative }, { raw_file_path: relative }] }, select: { capture_id: true } }));
  return Boolean(await client.prediction.findFirst({ where: { prediction_id: id,
    OR: [{ processed_jpg_path: relative }, { ndvi_visual_path: relative }] }, select: { prediction_id: true } }));
}
