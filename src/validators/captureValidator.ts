import type { UpdateCaptureStoredInput } from "../models";

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

  if (typeof value === "bigint") return parseSafeBytes(value.toString());

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Ukuran bytes string tidak valid: "${value}"`);
    }
    const number = Number(trimmed);
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new Error(
        `Ukuran bytes di luar rentang safe integer JavaScript: "${value}"`,
      );
    }
    return number;
  }

  throw new Error(`Tipe data ukuran bytes tidak dikenali: ${typeof value}`);
}

export function validateStoredCaptureInput(
  input: UpdateCaptureStoredInput,
): void {
  validateCaptureId(input.captureId);
  const expectedJpgPath = `captures/${input.captureId}/original.jpg`;
  const expectedRawPath = `captures/${input.captureId}/original.raw`;

  if (!input.originalJpgPath || input.originalJpgPath !== expectedJpgPath) {
    throw new Error(
      `originalJpgPath tidak valid: "${input.originalJpgPath}". Harus bernilai "${expectedJpgPath}".`,
    );
  }
  if (!input.rawFilePath || input.rawFilePath !== expectedRawPath) {
    throw new Error(
      `rawFilePath tidak valid: "${input.rawFilePath}". Harus bernilai "${expectedRawPath}".`,
    );
  }
  if (
    !Number.isSafeInteger(input.jpgSizeBytes) ||
    input.jpgSizeBytes <= 0
  ) {
    throw new Error(
      `jpgSizeBytes harus merupakan bilangan bulat positif yang aman (safe integer): ${input.jpgSizeBytes}`,
    );
  }
  if (
    !Number.isSafeInteger(input.rawSizeBytes) ||
    input.rawSizeBytes <= 0
  ) {
    throw new Error(
      `rawSizeBytes harus merupakan bilangan bulat positif yang aman (safe integer): ${input.rawSizeBytes}`,
    );
  }
}

export const assertCaptureId = validateCaptureId;
