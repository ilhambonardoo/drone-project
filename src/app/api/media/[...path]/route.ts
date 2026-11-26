import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { query } from "@/src/lib/db";
import { parseMediaPath, resolveMediaFile } from "@/src/lib/mediaUrl";

// Access control for ALL routes is required at Nginx before deployment. Bind Next to loopback only.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const relative = (await params).path.join("/");
  let info;
  try {
    info = parseMediaPath(relative);
  } catch {
    return NextResponse.json(
      { detail: "Path media tidak valid." },
      { status: 400 },
    );
  }
  try {
    const rows =
      info.group === "captures"
        ? await query(
            "SELECT capture_id FROM uji.captures WHERE capture_id = $1 AND status = $2 AND (original_jpg_path = $3 OR raw_file_path = $3)",
            [info.id, "stored", relative],
          )
        : await query(
            "SELECT prediction_id FROM uji.predictions WHERE prediction_id = $1 AND (processed_jpg_path = $2 OR ndvi_visual_path = $2)",
            [info.id, relative],
          );
    if (!rows.length)
      return NextResponse.json(
        { detail: "Media tidak ditemukan." },
        { status: 404 },
      );
    let media;
    try {
      media = await resolveMediaFile(relative);
    } catch {
      return NextResponse.json(
        { detail: "Media tidak ditemukan." },
        { status: 404 },
      );
    }
    const raw = info.filename.endsWith(".raw");
    const stream = Readable.toWeb(
      createReadStream(media.file),
    ) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Type": raw
          ? "application/octet-stream"
          : info.filename.endsWith(".png")
            ? "image/png"
            : "image/jpeg",
        "Content-Length": String(media.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `${raw ? "attachment" : "inline"}; filename="${info.id}-${info.filename}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "Media belum dapat diakses." },
      { status: 503 },
    );
  }
}
