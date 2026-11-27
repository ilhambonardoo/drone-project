import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migration credentials are separate from runtime DATABASE_URL. No fallback.
const url = process.env.MIGRATION_DATABASE_URL;
if (url && new URL(url).searchParams.get("schema") !== "uji") {
  throw new Error("MIGRATION_DATABASE_URL harus menargetkan schema=uji.");
}
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});
