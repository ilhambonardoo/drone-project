import { NextResponse } from "next/server";
import { CaptureStorageError } from "@/src/lib/captureStorage";
import { ApiError, assertSameOrigin } from "@/src/lib/mapirClient";
import { analyzeCapture } from "@/src/services/captureAnalysisService";
import { validateCaptureId } from "@/src/validators/captureValidator";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  const { captureId } = await params;
  try {
    validateCaptureId(captureId);
  } catch {
    return NextResponse.json(
      { detail: "Capture ID tidak valid." },
      { status: 400 },
    );
  }
  try {
    assertSameOrigin(request);
    return NextResponse.json(await analyzeCapture(captureId));
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
  }
}
