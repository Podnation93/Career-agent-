/**
 * Background worker. Phase 4 wires BullMQ queues (gmail-import, scoring) here.
 * If REDIS_URL is not set, the worker idles — the API scores synchronously, so
 * the app stays fully functional without Redis (graceful degradation).
 */
const redisUrl = process.env.REDIS_URL;

async function main() {
  if (!redisUrl) {
    console.log(
      "[worker] REDIS_URL not set — queues disabled. The API handles scoring synchronously. " +
        "Set REDIS_URL and implement the BullMQ queues (see docs/MILESTONES.md Phase 4) to enable background imports.",
    );
    // Keep the process alive so `pnpm dev` can run all services together.
    setInterval(() => {}, 1 << 30);
    return;
  }

  console.log(`[worker] Connecting to Redis at ${redisUrl} … (queue processors land in Phase 4)`);
  // Phase 4:
  //   const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  //   new Worker("gmail-import", gmailImportProcessor, { connection });
  //   new Worker("scoring", scoringProcessor, { connection });
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
