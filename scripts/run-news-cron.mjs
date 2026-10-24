const baseUrl = (process.env.NEWS_CRON_URL ?? "http://localhost:4000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

if (!secret || secret.length < 16) {
  console.error("Set CRON_SECRET in apps/api/.env before running the News Cron.");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`${baseUrl}/v1/internal/cron/news`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.text();
    if (!response.ok) {
      console.error(`News Cron returned HTTP ${response.status}: ${body.slice(0, 500)}`);
      process.exitCode = 1;
    } else {
      console.log(`News Cron completed: ${body}`);
    }
  } catch (error) {
    console.error(
      `Could not call News Cron at ${baseUrl}. Start the API with pnpm dev:api first.`,
    );
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  }
}
