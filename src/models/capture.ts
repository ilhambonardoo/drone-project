/** Record lengkap dari tabel uji.captures. */
export interface CaptureRecord {
  capture_id: string;
  drone_id: string | null;
  created_at: Date;
  captured_at: Date | null;
  raw_file_path: string | null;
  original_jpg_path: string | null;
  raw_size_bytes: number | null;
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

/** Hasil JOIN uji.predictions dan uji.captures. */
export interface LatestPredictionRow extends PredictionRecord {
  capture_created_at: Date;
  drone_id: string | null;
  captured_at: Date | null;
  original_jpg_path: string | null;
  raw_file_path: string | null;
  jpg_size_bytes: number | null;
  raw_size_bytes: number | null;
  capture_status: "pending" | "stored" | "failed";
}

export interface InsertCaptureInput {
  captureId: string;
  droneId?: string | null;
  capturedAt?: Date | null;
}

export interface TriggerCaptureResult {
  capture_id: string;
  status: string;
  dbError: boolean;
}

export interface UpdateCaptureStoredInput {
  captureId: string;
  originalJpgPath: string;
  rawFilePath: string;
  jpgSizeBytes: number;
  rawSizeBytes: number;
}

/** DTO input untuk menyimpan hasil prediksi. */
export interface InsertPredictionInput {
  predictionId: string;
  captureId: string;
  processedJpgPath: string;
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
  preprocessingVersion: string | null;
  modelSha256: string | null;
  configSha256: string | null;
}
