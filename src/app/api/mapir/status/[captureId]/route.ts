import { NextResponse } from "next/server";
import { assertCaptureId } from "@/src/lib/captureStorage";
import { ApiError, getCameraStatus } from "@/src/lib/mapirClient";

export async function GET(
  _request: Request,
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
  try {
    const data = await getCameraStatus(captureId);
    return NextResponse.json(
      { capture_id: captureId, status: data.status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        detail:
          e instanceof ApiError ? e.message : "Gagal memeriksa status kamera.",
      },
      { status: e instanceof ApiError ? e.status : 502 },
    );
  }
}
