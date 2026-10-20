import { runJobs } from "./lib/jobs";
import { db } from "./lib/db";
let running = true;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
do {
  try {
    const result = await runJobs();
    if (result.scanned) console.log(new Date().toISOString(), result);
  } catch (e) {
    console.error("Worker error:", e instanceof Error ? e.message : "unknown");
  }
  if (process.argv.includes("--once")) break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
} while (running);
await db.$disconnect();
