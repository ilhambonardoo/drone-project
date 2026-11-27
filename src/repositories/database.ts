import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "../lib/prisma";

export type RepositoryDb = Pick<PrismaClient, "capture" | "prediction">;

export function repositoryDb(db?: RepositoryDb): RepositoryDb {
  return db ?? getPrisma();
}
