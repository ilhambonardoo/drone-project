/**
 * @file src/lib/captureDb.ts
 * @description Data-Access Layer (DAL) untuk tabel uji.captures dan uji.predictions.
 *
 * Ketentuan:
 * - Semua query menyebut schema uji secara eksplisit.
 * - Semua nilai dinamis menggunakan parameterisasi SQL ($1, $2, ...).
 * - Fungsi yang beroperasi di bawah advisory lock menerima PoolClient
 *   agar tidak mengambil koneksi baru dari pool.
 * - Tabel uji.predictions bersifat append-only (INSERT saja, tidak ada UPDATE/DELETE).
 * - Tidak ada nilai yang dikarang: drone_id, captured_at, preprocessing_version,
 *   model_sha256, dan config_sha256 boleh NULL jika tidak tersedia.
 * - Validasi runtime ketat sebelum query dijalankan.
 * - Pengecekan rowCount untuk memastikan operasi UPDATE benar-benar mengubah data.
 */

import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { query, execute, getClient, closePool } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Data
// ─────────────────────────────────────────────────────────────────────────────

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
    captureId.length > 128 || /[^A-Za-z0-9_-]/.test(captureId)
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

// ─────────────────────────────────────────────────────────────────────────────
// Fungsi Pembantu Eksekusi Query
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menjalankan query SELECT baik melalui dedicated PoolClient (jika diberikan)
 * atau melalui pool query umum (jika client bernilai undefined).
 */
async function executeQuery<
  T extends QueryResultRow = QueryResultRow,
>(
  client: PoolClient | undefined,
  text: string,
  params?: unknown[],
): Promise<T[]> {
  if (client) {
    const res = await client.query<T>(text, params);
    return res.rows;
  }
  return query<T>(text, params);
}

/**
 * Menjalankan query mutasi (UPDATE, DELETE, INSERT) dan mengembalikan objek QueryResult
 * agar pemanggil dapat memeriksa rowCount.
 */
async function executeMutation<
  T extends QueryResultRow = QueryResultRow,
>(
  client: PoolClient | undefined,
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  if (client) {
    return client.query<T>(text, params);
  }
  return execute<T>(text, params);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fungsi DAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menyisipkan record capture baru ke uji.captures.
 *
 * Bersifat idempoten: ON CONFLICT (capture_id) DO NOTHING karena capture_id
 * adalah PRIMARY KEY. Pemanggilan kedua untuk capture_id yang sama diabaikan
 * secara aman.
 *
 * @param input  - Data capture dari Capture API.
 * @param client - Opsional dedicated PoolClient (misalnya di bawah advisory lock).
 */
export async function insertCapture(
  input: InsertCaptureInput,
  client?: PoolClient,
): Promise<void> {
  const { captureId, droneId = null, capturedAt = null } = input;
  validateCaptureId(captureId);

  await executeQuery(
    client,
    `INSERT INTO uji.captures (capture_id, drone_id, captured_at, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (capture_id) DO NOTHING`,
    [captureId, droneId, capturedAt],
  );
}

/**
 * Mengambil satu record capture berdasarkan capture_id.
 *
 * @param captureId - ID capture dari Capture API.
 * @param client    - Opsional dedicated PoolClient.
 * @returns CaptureRecord jika ditemukan, null jika tidak ada.
 */
export async function getCaptureById(
  captureId: string,
  client?: PoolClient,
): Promise<CaptureRecord | null> {
  validateCaptureId(captureId);

  const rows = await executeQuery<CaptureRecord>(
    client,
    `SELECT
       capture_id,
       drone_id,
       created_at,
       captured_at,
       raw_file_path,
       original_jpg_path,
       raw_size_bytes,
       jpg_size_bytes,
       status,
       error_message
     FROM uji.captures
     WHERE capture_id = $1`,
    [captureId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    jpg_size_bytes: parseSafeBytes(row.jpg_size_bytes),
    raw_size_bytes: parseSafeBytes(row.raw_size_bytes),
  };
}

/**
 * Memperbarui status capture menjadi 'stored' beserta path dan ukuran
 * kedua file asli (JPG dan RAW).
 *
 * Ketentuan Validasi Runtime:
 * - captureId harus valid.
 * - originalJpgPath dan rawFilePath tidak boleh kosong atau null.
 * - Path harus relatif dan tepat mengikuti pola:
 *   captures/<captureId>/original.jpg dan captures/<captureId>/original.raw
 * - jpgSizeBytes dan rawSizeBytes harus merupakan bilangan bulat positif yang memenuhi Number.isSafeInteger().
 * - Memeriksa rowCount hasil query; jika rowCount == 0, melempar error.
 *
 * @param input  - Path, ukuran file JPG dan RAW, serta capture_id.
 * @param client - Opsional dedicated PoolClient.
 */
export async function updateCaptureStored(
  input: UpdateCaptureStoredInput,
  client?: PoolClient,
): Promise<void> {
  const {
    captureId,
    originalJpgPath,
    rawFilePath,
    jpgSizeBytes,
    rawSizeBytes,
  } = input;

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

  // 4. Eksekusi query mutasi
  const result = await executeMutation(
    client,
    `UPDATE uji.captures
     SET status            = 'stored',
         original_jpg_path = $2,
         raw_file_path     = $3,
         jpg_size_bytes    = $4,
         raw_size_bytes    = $5,
         error_message     = NULL
     WHERE capture_id = $1`,
    [captureId, originalJpgPath, rawFilePath, jpgSizeBytes, rawSizeBytes],
  );

  // 5. Pengecekan rowCount: pastikan ada baris yang diperbarui
  if (!result.rowCount || result.rowCount === 0) {
    throw new Error(
      `Record capture dengan ID "${captureId}" tidak ditemukan untuk diperbarui.`,
    );
  }
}

/**
 * Memperbarui status dan pesan error capture.
 * Hanya menerima status 'pending' atau 'failed'.
 * Jangan gunakan untuk 'stored' — gunakan updateCaptureStored.
 *
 * @param captureId    - ID capture.
 * @param status       - Status baru: 'pending' atau 'failed'.
 * @param errorMessage - Pesan error opsional (NULL jika tidak ada).
 * @param client       - Opsional dedicated PoolClient.
 */
export async function updateCaptureStatus(
  captureId: string,
  status: "pending" | "failed",
  errorMessage?: string | null,
  client?: PoolClient,
): Promise<void> {
  validateCaptureId(captureId);

  if (status !== "pending" && status !== "failed") {
    throw new Error(
      `Status tidak valid: "${status}". updateCaptureStatus hanya menerima "pending" atau "failed". Gunakan updateCaptureStored untuk status "stored".`,
    );
  }

  const result = await executeMutation(
    client,
    `UPDATE uji.captures
     SET status        = $2,
         error_message = $3
     WHERE capture_id = $1`,
    [captureId, status, errorMessage ?? null],
  );

  if (!result.rowCount || result.rowCount === 0) {
    throw new Error(
      `Record capture dengan ID "${captureId}" tidak ditemukan untuk diperbarui.`,
    );
  }
}

/**
 * Mencari prediksi terakhir untuk capture_id tertentu.
 *
 * Menerima PoolClient agar dapat dijalankan dalam konteks advisory lock
 * yang sama pada Tahap 5 (endpoint analyze).
 *
 * @param client    - PoolClient aktif (di bawah advisory lock).
 * @param captureId - ID capture yang dicari.
 * @returns PredictionRecord terbaru jika ada, null jika belum pernah diproses.
 */
export async function getPredictionByCaptureId(
  client: PoolClient,
  captureId: string,
): Promise<PredictionRecord | null> {
  validateCaptureId(captureId);

  const result = await client.query<PredictionRecord>(
    `SELECT
       prediction_id,
       capture_id,
       created_at,
       processed_jpg_path,
       ndvi_visual_path,
       classification,
       class_index,
       prediction_score,
       score_terserang,
       score_sehat,
       threshold,
       ndvi,
       green_mean_scaled,
       red_mean_scaled,
       nir_mean_scaled,
       model_name,
       model_status,
       score_calibrated,
       radiometric_mode,
       radiometric_validated,
       physical_coverage_target_m,
       physical_coverage_validated,
       valid_pixel_percentage,
       automatic_spraying_allowed,
       preprocessing_version,
       model_sha256,
       config_sha256
     FROM uji.predictions
     WHERE capture_id = $1
     ORDER BY created_at DESC, prediction_id DESC
     LIMIT 1`,
    [captureId],
  );

  return result.rows[0] ?? null;
}

/**
 * Menyisipkan hasil prediksi baru ke uji.predictions.
 *
 * Tabel ini bersifat append-only: tidak ada UPDATE atau ON CONFLICT.
 * Pencegahan duplikasi dilakukan melalui advisory lock pada endpoint analyze.
 *
 * @param client - PoolClient aktif (di bawah advisory lock).
 * @param input  - Data hasil prediksi FastAPI yang sudah dipetakan.
 */
export async function insertPrediction(
  client: PoolClient,
  input: InsertPredictionInput,
): Promise<void> {
  validateCaptureId(input.captureId);

  await client.query(
    `INSERT INTO uji.predictions (
       prediction_id,
       capture_id,
       processed_jpg_path,
       ndvi_visual_path,
       classification,
       class_index,
       prediction_score,
       score_terserang,
       score_sehat,
       threshold,
       ndvi,
       green_mean_scaled,
       red_mean_scaled,
       nir_mean_scaled,
       model_name,
       model_status,
       score_calibrated,
       radiometric_mode,
       radiometric_validated,
       physical_coverage_target_m,
       physical_coverage_validated,
       valid_pixel_percentage,
       automatic_spraying_allowed,
       preprocessing_version,
       model_sha256,
       config_sha256
     ) VALUES (
       $1,  $2,  $3,  $4,  $5,  $6,  $7,  $8,  $9,  $10,
       $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
       $21, $22, $23, $24, $25, $26
     )`,
    [
      input.predictionId,
      input.captureId,
      input.processedJpgPath,
      input.ndviVisualPath,
      input.classification,
      input.classIndex,
      input.predictionScore,
      input.scoreTerserang,
      input.scoreSehat,
      input.threshold,
      input.ndvi,
      input.greenMeanScaled,
      input.redMeanScaled,
      input.nirMeanScaled,
      input.modelName,
      input.modelStatus,
      input.scoreCalibrated,
      input.radiometricMode,
      input.radiometricValidated,
      input.physicalCoverageTargetM,
      input.physicalCoverageValidated,
      input.validPixelPercentage,
      input.automaticSprayingAllowed,
      input.preprocessingVersion,
      input.modelSha256,
      input.configSha256,
    ],
  );
}

/**
 * Mengambil prediksi terbaru beserta metadata capture-nya (JOIN).
 * Digunakan oleh endpoint GET /api/predictions/latest untuk inisialisasi halaman.
 *
 * Urutan: p.created_at DESC, p.prediction_id DESC (tie-breaker UUID).
 *
 * @param client - Opsional dedicated PoolClient.
 * @returns LatestPredictionRow jika ada data, null jika tabel kosong.
 */
export async function getLatestPrediction(
  client?: PoolClient,
): Promise<LatestPredictionRow | null> {
  const rows = await executeQuery<LatestPredictionRow>(
    client,
    `SELECT
       -- Kolom dari uji.predictions
       p.prediction_id,
       p.capture_id,
       p.created_at,
       p.processed_jpg_path,
       p.ndvi_visual_path,
       p.classification,
       p.class_index,
       p.prediction_score,
       p.score_terserang,
       p.score_sehat,
       p.threshold,
       p.ndvi,
       p.green_mean_scaled,
       p.red_mean_scaled,
       p.nir_mean_scaled,
       p.model_name,
       p.model_status,
       p.score_calibrated,
       p.radiometric_mode,
       p.radiometric_validated,
       p.physical_coverage_target_m,
       p.physical_coverage_validated,
       p.valid_pixel_percentage,
       p.automatic_spraying_allowed,
       p.preprocessing_version,
       p.model_sha256,
       p.config_sha256,
       -- Kolom dari uji.captures (alias eksplisit untuk menghindari konflik)
       c.created_at      AS capture_created_at,
       c.drone_id,
       c.captured_at,
       c.original_jpg_path,
       c.raw_file_path,
       c.jpg_size_bytes,
       c.raw_size_bytes,
       c.status          AS capture_status
     FROM uji.predictions p
     JOIN uji.captures c USING (capture_id)
     ORDER BY p.created_at DESC, p.prediction_id DESC
     LIMIT 1`,
  );

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    jpg_size_bytes: parseSafeBytes(row.jpg_size_bytes),
    raw_size_bytes: parseSafeBytes(row.raw_size_bytes),
  };
}

// Re-export getClient dan closePool agar pemanggil dapat menggunakannya
export { getClient, closePool };
