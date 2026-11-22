import { NextResponse } from "next/server";

export async function GET() {
  const apiUrl = process.env.DREAMPALM_API_URL;

  try {
    const response = await fetch(`${apiUrl}/health`, { cache: "no-store" });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { raspberry_pi: "offline", mapir: { ready: false }, capture_busy: false },
      { status: 503 },
    );
  }
}
