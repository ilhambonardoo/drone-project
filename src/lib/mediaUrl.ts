import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { assertCaptureId, storageRoot } from "./captureStorage";

export const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseMediaPath(relativePath: string): {
  group: "captures" | "predictions";
  id: string;
  filename: string;
} {
  const [group, id, filename, ...extra] = relativePath.split("/");
  if (!group || !id || !filename || extra.length)
    throw new Error("Path media tidak valid.");
  if (group === "captures") {
    assertCaptureId(id);
    if (filename !== "original.jpg" && filename !== "original.raw")
      throw new Error("Path media tidak valid.");
  } else if (group === "predictions") {
    if (
      !UUID_V4.test(id) ||
      (filename !== "processed.jpg" && filename !== "ndvi.png")
    )
      throw new Error("Path media tidak valid.");
  } else throw new Error("Path media tidak valid.");
  return { group, id, filename };
}
export function toMediaUrl(relativePath: string): string {
  parseMediaPath(relativePath);
  return `/api/media/${relativePath}`;
}
/** Reject symlinks at every level below the configured root. Storage is private to the service user. */
export async function resolveMediaFile(
  relativePath: string,
): Promise<{ file: string; size: number }> {
  parseMediaPath(relativePath);
  const root = await realpath(storageRoot());
  let file = root;
  const segments = relativePath.split("/");
  for (let i = 0; i < segments.length; i++) {
    file = path.join(file, segments[i]);
    const stat = await lstat(file);
    if (
      stat.isSymbolicLink() ||
      (i < segments.length - 1 ? !stat.isDirectory() : !stat.isFile())
    )
      throw new Error("Media tidak valid.");
    const rel = path.relative(root, await realpath(file));
    if (
      !rel ||
      rel === ".." ||
      rel.startsWith(`..${path.sep}`) ||
      path.isAbsolute(rel)
    )
      throw new Error("Media di luar storage.");
    if (i === segments.length - 1) {
      if (stat.size <= 0) throw new Error("Media kosong.");
      return { file, size: stat.size };
    }
  }
  throw new Error("Media tidak valid.");
}
