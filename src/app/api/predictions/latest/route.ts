import { NextResponse, connection } from "next/server";
import { getLatestPredictionResult } from "@/src/services/predictionService";

export async function GET() {
  await connection();
  try {
    return NextResponse.json(
      { result: await getLatestPredictionResult() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { detail: "Prediksi terakhir belum dapat diakses." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
