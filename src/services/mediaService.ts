import { mediaExists } from "../repositories/mediaRepository";

export function canAccessMedia(
  group: "captures" | "predictions",
  id: string,
  relativePath: string,
): Promise<boolean> {
  return mediaExists(group, id, relativePath);
}
