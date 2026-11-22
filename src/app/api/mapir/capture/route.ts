import { NextResponse } from "next/server";
import { getErrorMessage } from "@/src/lib/errors";

export async function POST() {
  const apiUrl = process.env.DREAMPALM_API_URL;
  const apiKey = process.env.DREAMPALM_API_KEY;

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { detail: "Konfigurasi DREAMPALM_API_URL atau API_KEY belum diatur." },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(`${apiUrl}/captures`, {
      method: "POST",
      headers: {
        "X-DreamPalm-Key": apiKey,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        detail: getErrorMessage(error, "Gagal menghubungi Capture API."),
      },
      { status: 502 },
    );
  }
}
