import { getLatestPrediction } from "../repositories/predictionRepository";
import { latestResult } from "../lib/predictionResult";

export async function getLatestPredictionResult() {
  const row = await getLatestPrediction();
  return row ? latestResult(row) : null;
}
