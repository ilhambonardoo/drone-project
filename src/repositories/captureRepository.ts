import type { Capture } from "@prisma/client";
import type {
  CaptureRecord,
  InsertCaptureInput,
  UpdateCaptureStoredInput,
} from "../models";
import { parseSafeBytes, validateCaptureId, validateStoredCaptureInput } from "../validators/captureValidator";
import { repositoryDb, type RepositoryDb } from "./database";

function toCaptureRecord(row: Capture): CaptureRecord {
  if (
    row.status !== "pending" &&
    row.status !== "stored" &&
    row.status !== "failed"
  ) {
    throw new Error("Status capture database tidak valid.");
  }
  return {
    ...row,
    status: row.status,
    jpg_size_bytes: parseSafeBytes(row.jpg_size_bytes),
    raw_size_bytes: parseSafeBytes(row.raw_size_bytes),
  };
}

export async function checkCaptureDatabase(
  db?: RepositoryDb,
): Promise<void> {
  await repositoryDb(db).capture.findFirst({
    select: { capture_id: true },
  });
}

export async function insertCapture(
  input: InsertCaptureInput,
  db?: RepositoryDb,
): Promise<void> {
  validateCaptureId(input.captureId);
  await repositoryDb(db).capture.createMany({
    data: [
      {
        capture_id: input.captureId,
        drone_id: input.droneId ?? null,
        captured_at: input.capturedAt ?? null,
        status: "pending",
      },
    ],
    skipDuplicates: true,
  });
}

export async function getCaptureById(
  captureId: string,
  db?: RepositoryDb,
): Promise<CaptureRecord | null> {
  validateCaptureId(captureId);
  const row = await repositoryDb(db).capture.findUnique({
    where: { capture_id: captureId },
  });
  return row ? toCaptureRecord(row) : null;
}

export async function fillCaptureMetadata(
  captureId: string,
  metadata: Omit<InsertCaptureInput, "captureId">,
  db?: RepositoryDb,
): Promise<void> {
  validateCaptureId(captureId);
  const client = repositoryDb(db);
  if (metadata.droneId != null) {
    await client.capture.updateMany({
      where: { capture_id: captureId, drone_id: null },
      data: { drone_id: metadata.droneId },
    });
  }
  if (metadata.capturedAt != null) {
    await client.capture.updateMany({
      where: { capture_id: captureId, captured_at: null },
      data: { captured_at: metadata.capturedAt },
    });
  }
}

export async function updateCaptureStored(
  input: UpdateCaptureStoredInput,
  db?: RepositoryDb,
): Promise<void> {
  validateStoredCaptureInput(input);
  const result = await repositoryDb(db).capture.updateMany({
    where: { capture_id: input.captureId },
    data: {
      status: "stored",
      original_jpg_path: input.originalJpgPath,
      raw_file_path: input.rawFilePath,
      jpg_size_bytes: BigInt(input.jpgSizeBytes),
      raw_size_bytes: BigInt(input.rawSizeBytes),
      error_message: null,
    },
  });
  if (!result.count) {
    throw new Error(
      `Record capture dengan ID "${input.captureId}" tidak ditemukan untuk diperbarui.`,
    );
  }
}

export async function updateCaptureStatus(
  captureId: string,
  status: "pending" | "failed",
  errorMessage?: string | null,
  db?: RepositoryDb,
): Promise<void> {
  validateCaptureId(captureId);
  if (status !== "pending" && status !== "failed") {
    throw new Error(
      'Status tidak valid. updateCaptureStatus hanya menerima "pending" atau "failed".',
    );
  }
  const result = await repositoryDb(db).capture.updateMany({
    where: { capture_id: captureId },
    data: { status, error_message: errorMessage ?? null },
  });
  if (!result.count) {
    throw new Error(
      `Record capture dengan ID "${captureId}" tidak ditemukan untuk diperbarui.`,
    );
  }
}

export { toCaptureRecord };
