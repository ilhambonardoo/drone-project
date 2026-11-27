import { NextResponse } from "next/server";
import {
  ApiError,
  assertSameOrigin,
} from "@/src/lib/mapirClient";
import { triggerAndRecordCapture } from "@/src/services/captureService";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const data = await triggerAndRecordCapture();
    if (data.dbError) {
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
      status: data.status,
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
