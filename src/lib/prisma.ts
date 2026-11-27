import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (typeof window !== "undefined") throw new Error("Prisma hanya untuk server.");
const cache = globalThis as typeof globalThis & { dreampalmPrisma?: PrismaClient };

/** Lazy singleton: importing the module/build does not connect to PostgreSQL. */
export function getPrisma(): PrismaClient {
  if (cache.dreampalmPrisma) return cache.dreampalmPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum dikonfigurasi.");
  const adapter = new PrismaPg({
    connectionString, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
  }, { schema: "uji" });
  cache.dreampalmPrisma = new PrismaClient({ adapter });
  return cache.dreampalmPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  const client = cache.dreampalmPrisma;
  delete cache.dreampalmPrisma;
  if (client) await client.$disconnect();
}
