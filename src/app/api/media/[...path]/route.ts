import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { parseMediaPath, resolveMediaFile } from "@/src/lib/mediaUrl";
import { canAccessMedia } from "@/src/services/mediaService";

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
    if (!(await canAccessMedia(info.group, info.id, relative)))
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
