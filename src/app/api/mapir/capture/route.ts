import { NextResponse } from "next/server";
import { insertCapture, checkCaptureDatabase } from "@/src/lib/captureDb";
import {
  ApiError,
  assertSameOrigin,
  captureMetadata,
  triggerCapture,
} from "@/src/lib/mapirClient";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    // Check database readiness before triggering a physical action.
    await checkCaptureDatabase();
    const data = await triggerCapture();
    try {
      await insertCapture({
        captureId: data.capture_id,
        ...captureMetadata(data),
      });
    } catch {
      return NextResponse.json(
        {
          capture_id: data.capture_id,
          status: "pending",
          dbError: true,
          message:
            "Capture dipicu, tetapi metadata belum tercatat. Gunakan ID yang sama untuk melanjutkan.",
        },
        { status: 207 },
      );
    }
    return NextResponse.json({
      capture_id: data.capture_id,
      status: data.status || "pending",
    });
  } catch (e) {
    if (e instanceof ApiError)
      return NextResponse.json(
        { detail: e.message, code: e.code },
        { status: e.status },
      );
    return NextResponse.json(
      { detail: "Database belum siap. Kamera belum dipicu." },
      { status: 503 },
    );
  }
}
