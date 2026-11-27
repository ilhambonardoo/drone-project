import type {
  CaptureRecord,
  PredictionRecord,
  LatestPredictionRow,
} from "../models";
import type { StoredPredictionResult } from "../types";
import { toMediaUrl } from "./mediaUrl";
export function predictionResult(
  p: PredictionRecord,
  c: Pick<CaptureRecord, "original_jpg_path" | "raw_file_path">,
): StoredPredictionResult {
  return {
    captureId: p.capture_id,
    originalJpgUrl: c.original_jpg_path
      ? toMediaUrl(c.original_jpg_path)
      : null,
    originalRawUrl: c.raw_file_path ? toMediaUrl(c.raw_file_path) : null,
    mlResult: {
      success: true,
      predictionId: p.prediction_id,
      processedJpgPath: p.processed_jpg_path,
      ndviVisualPath: p.ndvi_visual_path,
      modelName: p.model_name,
      modelStatus: p.model_status,
      classification: p.classification,
      classIndex: p.class_index,
      scoreTerserang: p.score_terserang,
      scoreSehat: p.score_sehat,
      predictionScore: p.prediction_score,
      scoreCalibrated: p.score_calibrated,
      threshold: p.threshold,
      ndvi: p.ndvi,
      bands: {
        green: p.green_mean_scaled,
        red: p.red_mean_scaled,
        nir: p.nir_mean_scaled,
      },
      validPixelPercentage: p.valid_pixel_percentage,
      snapshotThumbnail: toMediaUrl(p.processed_jpg_path),
      snapshotNDVI: toMediaUrl(p.ndvi_visual_path),
      radiometricMode: p.radiometric_mode,
      radiometricValidated: p.radiometric_validated,
      physicalCoverageTargetMeters: p.physical_coverage_target_m,
      physicalCoverageValidated: p.physical_coverage_validated,
      automaticSprayingAllowed: p.automatic_spraying_allowed,
    },
  };
}
export function latestResult(row: LatestPredictionRow) {
  return predictionResult(row, row);
}
