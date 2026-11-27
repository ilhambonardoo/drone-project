import type { Prediction } from "@prisma/client";
import type {
  InsertPredictionInput,
  LatestPredictionRow,
  PredictionRecord,
} from "../models";
import { validateCaptureId } from "../validators/captureValidator";
import { toCaptureRecord } from "./captureRepository";
import { repositoryDb, type RepositoryDb } from "./database";

function toPredictionRecord(row: Prediction): PredictionRecord {
  if (
    (row.classification !== "Sehat" && row.classification !== "Terserang") ||
    (row.class_index !== 0 && row.class_index !== 1)
  ) {
    throw new Error("Klasifikasi database tidak valid.");
  }
  return {
    ...row,
    classification: row.classification,
    class_index: row.class_index,
  };
}

export async function getPredictionByCaptureId(
  captureId: string,
  db?: RepositoryDb,
): Promise<PredictionRecord | null> {
  validateCaptureId(captureId);
  const row = await repositoryDb(db).prediction.findFirst({
    where: { capture_id: captureId },
    orderBy: [{ created_at: "desc" }, { prediction_id: "desc" }],
  });
  return row ? toPredictionRecord(row) : null;
}

export async function insertPrediction(
  input: InsertPredictionInput,
  db?: RepositoryDb,
): Promise<void> {
  validateCaptureId(input.captureId);
  await repositoryDb(db).prediction.create({
    data: {
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
    },
  });
}

export async function getLatestPrediction(
  db?: RepositoryDb,
): Promise<LatestPredictionRow | null> {
  const row = await repositoryDb(db).prediction.findFirst({
    include: { capture: true },
    orderBy: [{ created_at: "desc" }, { prediction_id: "desc" }],
  });
  if (!row) return null;

  const { capture, ...prediction } = row;
  const captureRecord = toCaptureRecord(capture);
  return {
    ...toPredictionRecord(prediction),
    capture_created_at: captureRecord.created_at,
    drone_id: captureRecord.drone_id,
    captured_at: captureRecord.captured_at,
    original_jpg_path: captureRecord.original_jpg_path,
    raw_file_path: captureRecord.raw_file_path,
    jpg_size_bytes: captureRecord.jpg_size_bytes,
    raw_size_bytes: captureRecord.raw_size_bytes,
    capture_status: captureRecord.status,
  };
}

export { toPredictionRecord };
