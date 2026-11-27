import type { RepositoryDb } from "./database";
import { repositoryDb } from "./database";

export async function mediaExists(
  group: "captures" | "predictions",
  id: string,
  relativePath: string,
  db?: RepositoryDb,
): Promise<boolean> {
  const client = repositoryDb(db);
  if (group === "captures") {
    return Boolean(
      await client.capture.findFirst({
        where: {
          capture_id: id,
          status: "stored",
          OR: [
            { original_jpg_path: relativePath },
            { raw_file_path: relativePath },
          ],
        },
        select: { capture_id: true },
      }),
    );
  }
  return Boolean(
    await client.prediction.findFirst({
      where: {
        prediction_id: id,
        OR: [
          { processed_jpg_path: relativePath },
          { ndvi_visual_path: relativePath },
        ],
      },
      select: { prediction_id: true },
    }),
  );
}
