import { NextResponse, connection } from "next/server";
import { getLatestPrediction } from "@/src/lib/captureDb";
import { latestResult } from "@/src/lib/predictionResult";

export async function GET() {
  await connection();
  try {
    const row = await getLatestPrediction();
    return NextResponse.json(
      { result: row ? latestResult(row) : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { detail: "Prediksi terakhir belum dapat diakses." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
