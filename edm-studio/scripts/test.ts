import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const dir = mkdtempSync(join(tmpdir(), "edm-tests-"));
writeFileSync(join(dir, "test.db"), "");
const env = {
  ...process.env,
  DATABASE_URL: `file:${join(dir, "test.db")}`,
  DEMO_MODE: "true",
  DRY_RUN: "true",
  EMAIL_PROVIDER: "mock",
  SHOPIFY_SHOP_DOMAIN: "test.myshopify.com",
  SHOPIFY_WEBHOOK_SECRET: "test-shopify-secret",
  RESEND_WEBHOOK_SECRET: `whsec_${Buffer.from("test-resend-secret-at-least-32-bytes").toString("base64")}`,
  ADMIN_PASSWORD: "",
  SESSION_SECRET: "",
  APP_URL: "http://127.0.0.1:3100",
};
try {
  const migration = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env, stdio: "inherit" },
  );
  if (migration.status) process.exitCode = migration.status;
  else {
    const tests = spawnSync(
      process.execPath,
      [
        "node_modules/tsx/dist/cli.mjs",
        "--test",
        "--test-concurrency=1",
        "tests/domain.test.ts",
        "tests/integration.test.ts",
      ],
      { env, stdio: "inherit" },
    );
    process.exitCode = tests.status || 0;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
