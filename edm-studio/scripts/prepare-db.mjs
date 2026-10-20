import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
const url = process.env.DATABASE_URL || "file:./dev.db";
if (url.startsWith("file:")) {
  const path = resolve("prisma", url.slice(5));
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, "", { flag: "wx" });
}
