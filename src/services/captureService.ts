import type { TriggerCaptureResult } from "../models";
import {
  checkCaptureDatabase,
  insertCapture,
} from "../repositories/captureRepository";
import { captureMetadata, triggerCapture } from "../lib/mapirClient";

export async function triggerAndRecordCapture(): Promise<TriggerCaptureResult> {
  await checkCaptureDatabase();
  const capture = await triggerCapture();
  let dbError = false;

  try {
    await insertCapture({
      captureId: capture.capture_id,
      ...captureMetadata(capture),
    });
  } catch {
    dbError = true;
  }

  return {
    capture_id: capture.capture_id,
    status: capture.status || "pending",
    dbError,
  };
}
