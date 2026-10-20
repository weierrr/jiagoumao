import "dotenv/config";
import { PrismaClient } from "@prisma/client";
process.env.DATABASE_URL ||= "file:./dev.db";
const globalDb = globalThis as unknown as { edmDb?: PrismaClient };
export const db = globalDb.edmDb ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.edmDb = db;
export const STORE_ID =
  process.env.DEMO_MODE === "false" ? "store-live" : "store-demo";
export const DEMO = process.env.DEMO_MODE !== "false";
export const DRY_RUN =
  process.env.DRY_RUN !== "false" ||
  process.env.EMAIL_PROVIDER !== "resend" ||
  DEMO;
export async function audit(action: string, detail: string, targetId?: string) {
  return db.auditLog.create({
    data: { storeId: STORE_ID, action, detail, targetId },
  });
}
