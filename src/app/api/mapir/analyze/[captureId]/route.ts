import { NextResponse } from "next/server";
import {
  getClient,
  getCaptureById,
  getPredictionByCaptureId,
  insertCapture,
  insertPrediction,
  updateCaptureStatus,
  updateCaptureStored,
} from "@/src/lib/captureDb";
import type { PoolClient } from "pg";
import {
  assertCaptureId,
  CaptureStorageError,
  downloadAndSave,
  readStoredCapture,
} from "@/src/lib/captureStorage";
import {
  ApiError,
  assertSameOrigin,
  cameraConfig,
  captureMetadata,
  getCameraStatus,
} from "@/src/lib/mapirClient";
import { processSnapshot } from "@/src/lib/inferenceClient";
import { predictionResult } from "@/src/lib/predictionResult";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  const { captureId } = await params;
  try {
    assertCaptureId(captureId);
  } catch {
    return NextResponse.json(
      { detail: "Capture ID tidak valid." },
      { status: 400 },
    );
  }
  let client: PoolClient | undefined;
  let locked = false;
  let lockUncertain = false;
  try {
    assertSameOrigin(request);
    client = await getClient();
    lockUncertain = true;
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
      [`dreampalm-uji:${captureId}`],
    );
    locked = lock.rows[0]?.locked === true;
    lockUncertain = false;
    if (!locked)
      throw new ApiError(
        409,
        "ANALYSIS_BUSY",
        "Capture ini sedang dianalisis. Coba lagi setelah proses selesai.",
      );
    let capture = await getCaptureById(captureId, client);
    const existing = await getPredictionByCaptureId(client, captureId);
    if (existing && capture)
      return NextResponse.json(predictionResult(existing, capture));
    let files;
    if (capture?.status === "stored") {
      if (
        !capture.original_jpg_path ||
        !capture.raw_file_path ||
        capture.jpg_size_bytes === null ||
        capture.raw_size_bytes === null
      )
        throw new ApiError(
          500,
          "STORAGE_METADATA",
          "Metadata penyimpanan tidak lengkap.",
        );
      files = await readStoredCapture(captureId, {
        originalJpgPath: capture.original_jpg_path,
        rawFilePath: capture.raw_file_path,
        jpgSizeBytes: capture.jpg_size_bytes,
        rawSizeBytes: capture.raw_size_bytes,
      });
    } else {
      const status = await getCameraStatus(captureId);
      if (status.status === "failed") {
        if (capture)
          await updateCaptureStatus(
            captureId,
            "failed",
            "Capture kamera gagal.",
            client,
          );
        throw new ApiError(422, "CAPTURE_FAILED", "Capture kamera gagal.");
      }
      if (status.status !== "completed")
        throw new ApiError(422, "CAPTURE_PENDING", "Capture belum selesai.");
      if (!capture)
        await insertCapture({ captureId, ...captureMetadata(status) }, client);
      else {
        const metadata = captureMetadata(status);
        await client.query(
          "UPDATE uji.captures SET drone_id = COALESCE(drone_id, $2), captured_at = COALESCE(captured_at, $3) WHERE capture_id = $1",
          [captureId, metadata.droneId, metadata.capturedAt],
        );
      }
      const { base, key } = cameraConfig();
      try {
        if (!status.files?.jpg?.url)
          throw new CaptureStorageError(
            "DOWNLOAD_FAILED",
            "URL JPG belum tersedia.",
          );
        files = await downloadAndSave({
          captureId,
          jpgUrl: status.files.jpg.url,
          rawUrl: status.files.raw?.url,
          apiKey: key,
          apiBaseUrl: base,
        });
      } catch (e) {
        const pending =
          e instanceof CaptureStorageError && e.code === "RAW_PENDING";
        await updateCaptureStatus(
          captureId,
          pending ? "pending" : "failed",
          pending ? "RAW belum tersedia." : "Pengunduhan file asli gagal.",
          client,
        );
        throw new ApiError(
          pending ? 422 : 502,
          pending ? "RAW_PENDING" : "STORAGE_FAILED",
          pending
            ? "RAW belum tersedia. Lanjutkan dengan capture ID yang sama."
            : "Penyimpanan JPG/RAW gagal. Coba lagi dengan capture ID yang sama.",
        );
      }
      await updateCaptureStored({ captureId, ...files }, client);
    }
    capture = await getCaptureById(captureId, client);
    if (!capture || capture.status !== "stored")
      throw new ApiError(
        500,
        "STORAGE_METADATA",
        "Metadata penyimpanan belum lengkap.",
      );
    const prediction = await processSnapshot(captureId, files.originalJpgPath);
    try {
      await insertPrediction(client, prediction);
    } catch {
      throw new ApiError(
        500,
        "ML_UNKNOWN",
        "Hasil analisis belum tercatat. File asli dipertahankan. Periksa database sebelum retry.",
      );
    }
    const saved = await getPredictionByCaptureId(client, captureId);
    if (!saved)
      throw new ApiError(
        500,
        "ML_UNKNOWN",
        "Hasil analisis belum dapat dibaca. Periksa database sebelum retry.",
      );
    return NextResponse.json(predictionResult(saved, capture));
  } catch (e) {
    if (e instanceof ApiError)
      return NextResponse.json(
        { code: e.code, detail: e.message },
        { status: e.status },
      );
    if (e instanceof CaptureStorageError)
      return NextResponse.json(
        {
          code: e.code,
          detail:
            "File lokal tidak lengkap atau tidak valid. Periksa penyimpanan.",
        },
        { status: 500 },
      );
    console.error("[analyze] Operasi gagal.");
    return NextResponse.json(
      {
        code: "ANALYSIS_ERROR",
        detail:
          "Analisis belum berhasil. Periksa layanan sebelum mencoba lagi.",
      },
      { status: 500 },
    );
  } finally {
    if (client) {
      let discard = lockUncertain;
      if (locked) {
        try {
          const result = await client.query<{ unlocked: boolean }>(
            "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked",
            [`dreampalm-uji:${captureId}`],
          );
          discard = result.rows[0]?.unlocked !== true;
        } catch {
          discard = true;
        }
      }
      client.release(discard);
    }
  }
}
