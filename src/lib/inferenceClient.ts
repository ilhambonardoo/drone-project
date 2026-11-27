import { readFile } from "node:fs/promises";
import type { InsertPredictionInput } from "./captureDb";
import { resolveMediaFile, UUID_V4 } from "./mediaUrl";
import { ApiError } from "./mapirClient";

/** Validate the actual FastAPI contract before writing any prediction metadata. */
export function validatePrediction(
  value: unknown,
  captureId: string,
): InsertPredictionInput {
  const fail = () =>
    new ApiError(502, "ML_RESPONSE", "Respons FastAPI tidak sesuai kontrak.");
  if (!value || typeof value !== "object") throw fail();
  const d = value as Record<string, unknown>;
  const str = (k: string): string => {
    const v = d[k];
    if (typeof v !== "string" || !v.trim()) throw fail();
    return v;
  };
  const bool = (k: string): boolean => {
    const v = d[k];
    if (typeof v !== "boolean") throw fail();
    return v;
  };
  const num = (v: unknown, min = -Infinity, max = Infinity): number => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      throw fail();
    return v;
  };
  const nullable = (v: unknown, min = -Infinity, max = Infinity) =>
    v === null ? null : num(v, min, max);
  if (d.success !== true) throw fail();
  const predictionId = str("predictionId");
  const processedJpgPath = str("processedJpgPath");
  const ndviVisualPath = str("ndviVisualPath");
  if (
    !UUID_V4.test(predictionId) ||
    processedJpgPath !== `predictions/${predictionId}/processed.jpg` ||
    ndviVisualPath !== `predictions/${predictionId}/ndvi.png`
  )
    throw fail();
  const classification = d.classification;
  const classIndex = d.classIndex;
  if (
    !(
      (classification === "Sehat" && classIndex === 0) ||
      (classification === "Terserang" && classIndex === 1)
    )
  )
    throw fail();
  if (!d.bands || typeof d.bands !== "object") throw fail();
  const bands = d.bands as Record<string, unknown>;
  if (bool("automaticSprayingAllowed")) throw fail();
  return {
    predictionId,
    captureId,
    processedJpgPath,
    ndviVisualPath,
    classification,
    classIndex,
    predictionScore: num(d.predictionScore, 0, 1),
    scoreTerserang: num(d.scoreTerserang, 0, 1),
    scoreSehat: num(d.scoreSehat, 0, 1),
    threshold: num(d.threshold, 0, 1),
    ndvi: nullable(d.ndvi, -1, 1),
    greenMeanScaled: nullable(bands.green),
    redMeanScaled: nullable(bands.red),
    nirMeanScaled: nullable(bands.nir),
    modelName: str("modelName"),
    modelStatus: str("modelStatus"),
    scoreCalibrated: bool("scoreCalibrated"),
    radiometricMode: str("radiometricMode"),
    radiometricValidated: bool("radiometricValidated"),
    physicalCoverageTargetM: nullable(d.physicalCoverageTargetMeters, 0),
    physicalCoverageValidated: bool("physicalCoverageValidated"),
    validPixelPercentage: nullable(d.validPixelPercentage, 0, 100),
    automaticSprayingAllowed: false,
    preprocessingVersion: null,
    modelSha256: null,
    configSha256: null,
  };
}
export async function processSnapshot(
  captureId: string,
  jpgPath: string,
): Promise<InsertPredictionInput> {
  const base = process.env.FASTAPI_URL?.replace(/\/+$/, "");
  if (!base) throw new ApiError(503, "ML_CONFIG", "FASTAPI_URL belum diatur.");
  const url = new URL(base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ApiError(503, "ML_CONFIG", "FASTAPI_URL tidak valid.");
  const { file, size } = await resolveMediaFile(jpgPath);
  if (size > 20 * 1024 * 1024)
    throw new ApiError(413, "JPG_TOO_LARGE", "JPG terlalu besar.");
  const bytes = await readFile(file);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
    `${captureId}.jpg`,
  );
  const signal = AbortSignal.timeout(60_000);
  let data: unknown;
  try {
    const res = await fetch(`${base}/process-snapshot`, {
      method: "POST",
      body: form,
      redirect: "error",
      signal,
      cache: "no-store",
    });
    if (!res.ok)
      throw new ApiError(
        502,
        "ML_FAILED",
        "FastAPI gagal memproses citra. Periksa layanan sebelum mencoba kembali.",
      );
    data = await res.json();
  } catch (e) {
    if (signal.aborted)
      throw new ApiError(
        504,
        "ML_UNKNOWN",
        "FastAPI timeout; proses mungkin masih berjalan. Periksa layanan sebelum retry.",
      );
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      502,
      "ML_UNKNOWN",
      "Hasil FastAPI belum dapat dipastikan. Periksa layanan sebelum retry.",
    );
  }
  const result = validatePrediction(data, captureId);
  await resolveMediaFile(result.processedJpgPath);
  await resolveMediaFile(result.ndviVisualPath);
  return result;
}
