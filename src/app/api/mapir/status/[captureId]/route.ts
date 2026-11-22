import { NextResponse } from "next/server";
import { getErrorMessage } from "@/src/lib/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  const { captureId } = await params;
  const apiUrl = process.env.DREAMPALM_API_URL?.replace(/\$/, "");
  const apiKey = process.env.DREAMPALM_API_KEY || "";
  const mlUrl = (process.env.FASTAPI_URL || "http://127.0.0.1:8000").replace(
    /\$/,
    "",
  );
  const targetStatusUrl = `${apiUrl}/captures/${captureId}`;

  try {
    const statusRes = await fetch(targetStatusUrl, {
      cache: "no-store",
      headers: {
        ...(apiKey ? { "X-DreamPalm-Key": apiKey } : {}),
      },
    });

    const statusData = await statusRes.json().catch(() => ({}));

    if (!statusRes.ok) {
      console.error(
        `[MAPIR Status Error] URL: ${targetStatusUrl} | Status: ${statusRes.status}`,
        statusData,
      );
      return NextResponse.json(
        {
          detail:
            statusData.detail || `Upstream mengembalikan ${statusRes.status}`,
          upstreamUrl: targetStatusUrl,
        },
        { status: statusRes.status },
      );
    }

    if (statusData.status !== "completed") {
      return NextResponse.json(statusData);
    }
    const jpgUrl = statusData.files?.jpg?.url;
    if (!jpgUrl) {
      return NextResponse.json(
        { detail: "URL file JPG tidak ditemukan pada response capture." },
        { status: 500 },
      );
    }

    const imageRes = await fetch(jpgUrl, {
      headers: {
        ...(apiKey ? { "X-DreamPalm-Key": apiKey } : {}),
      },
    });
    const imageBlob = await imageRes.blob();

    const formData = new FormData();
    formData.append("file", imageBlob, `${captureId}.jpg`);

    const mlRes = await fetch(`${mlUrl}/process-snapshot`, {
      method: "POST",
      body: formData,
    });

    const mlResult = await mlRes.json();
    if (!mlRes.ok) {
      return NextResponse.json(
        { detail: mlResult.detail || "Gagal memproses di FastAPI." },
        { status: mlRes.status },
      );
    }

    return NextResponse.json({
      status: "completed",
      capture_id: captureId,
      originalJpgUrl: statusData.files?.jpg?.url || null,
      originalRawUrl: statusData.files?.raw?.url || null,
      mlResult,
    });
  } catch (error: unknown) {
    console.error("[MAPIR Status Exception]", error);
    return NextResponse.json(
      {
        detail: getErrorMessage(
          error,
          "Terjadi kesalahan saat memproses capture.",
        ),
      },
      { status: 500 },
    );
  }
}
