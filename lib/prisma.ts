import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma's supported JavaScript engine uses the npm-verified query compiler and
// pg adapter; no downloaded native engine or disabled checksum is required.
const globalForPrisma = globalThis as unknown as { movePrisma?: PrismaClient };
export const prisma =
  globalForPrisma.movePrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.movePrisma = prisma;
