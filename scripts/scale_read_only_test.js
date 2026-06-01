#!/usr/bin/env node
const TARGET_BASE_URL = process.env.TARGET_BASE_URL || "http://127.0.0.1:3000";
const TOTAL_REQUESTS = Number(process.env.TOTAL_REQUESTS ?? 20000);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 500);
const AUTH_COOKIE = process.env.AUTH_COOKIE;

if (!globalThis.fetch) {
  throw new Error("Node runtime must expose fetch. Use Node 18+ or a compatible polyfill.");
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildTask(index) {
  return { type: "marketplace", category: randChoice(["all", "portrait", "editorial", "street", "glamour", "boudoir", "fantasy"])};
}

async function executeTask(task) {
  const url = new URL(TARGET_BASE_URL);
  const init = { headers: { "x-test-bypass-auth": "true" } };

  url.pathname = "/api/marketplace";
  url.searchParams.set("category", task.category);
  url.searchParams.set("limit", "24");

  const start = Date.now();
  try {
    const res = await fetch(url.toString(), init);
    const duration = Date.now() - start;
    return { ok: res.ok, status: res.status, duration, type: task.type };
  } catch (error) {
    const duration = Date.now() - start;
    return { ok: false, status: 0, duration, type: task.type, error: String(error) };
  }
}

async function runLoadTest() {
  console.log("[read-only-load-test] target=", TARGET_BASE_URL);
  console.log("[read-only-load-test] concurrency=", CONCURRENCY, "totalRequests=", TOTAL_REQUESTS);
  console.log("[read-only-load-test] authCookie=", AUTH_COOKIE ? "provided" : "none");

  const stats = { total: 0, success: 0, failed: 0, durations: [], statuses: {} };
  let inFlight = 0;
  let nextIndex = 0;
  const startTime = Date.now();

  function report(result) {
    stats.total += 1;
    if (result.ok) stats.success += 1;
    else stats.failed += 1;
    stats.durations.push(result.duration);
    stats.statuses[result.status] = (stats.statuses[result.status] ?? 0) + 1;
  }

  return new Promise((resolve) => {
    function maybeNext() {
      while (inFlight < CONCURRENCY && nextIndex < TOTAL_REQUESTS) {
        const task = buildTask(nextIndex);
        nextIndex += 1;
        inFlight += 1;
        executeTask(task).then((result) => {
          report(result);
        }).catch((err) => {
          report({ ok: false, status: 0, duration: 0, type: task.type, error: String(err) });
        }).finally(() => {
          inFlight -= 1;
          if (nextIndex >= TOTAL_REQUESTS && inFlight === 0) {
            const totalTime = Date.now() - startTime;
            const sorted = stats.durations.slice().sort((a, b) => a - b);
            const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
            const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
            const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
            const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
            console.log("\n[read-only-load-test] COMPLETE");
            console.log(` totalRequests=${stats.total}`);
            console.log(` success=${stats.success}`);
            console.log(` failed=${stats.failed}`);
            console.log(` totalTimeMs=${totalTime}`);
            console.log(` rps=${(stats.total / (totalTime / 1000)).toFixed(2)}`);
            console.log(` p50=${p50}ms p90=${p90}ms p95=${p95}ms p99=${p99}ms`);
            console.log(" statusDistribution=", stats.statuses);
            resolve();
          } else {
            maybeNext();
          }
        });
      }
    }
    maybeNext();
  });
}

runLoadTest().catch((err) => {
  console.error("[read-only-load-test] fatal error:", err);
  process.exit(1);
});
