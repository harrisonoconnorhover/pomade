// Drives the local Worker's scheduled handler without deploying a cloud service.
const port = process.argv.find((arg) => /^\d+$/.test(arg)) ?? '8787';
if (Number(port) < 1 || Number(port) > 65535)
  throw new Error('Choose a valid local Worker port.');
const once = process.argv.includes('--once');
const intervalArg=process.argv.find(a=>a.startsWith('--interval='))?.split('=')[1];
const interval=intervalArg?Number(intervalArg):60000;
if(!Number.isFinite(interval)||interval<5000||interval>3600000) throw new Error('Choose a clock interval from 5 seconds to 1 hour.');
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopping = true;
  process.exit(0);
});
const endpoint = `http://127.0.0.1:${port}/cdn-cgi/local/scheduled?cron=*+*+*+*+*`;
async function tick() {
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) throw new Error(`Worker returned ${response.status}`);
    console.log(`${new Date().toISOString()} Local worker tick delivered.`);
  } catch (error) {
    console.error(`Local clock: ${error.message}. Start npm run start first.`);
    if (once) process.exitCode = 1;
  }
  if (!once && !stopping) setTimeout(tick, interval);
}
await tick();
