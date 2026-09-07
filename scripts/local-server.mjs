// Start the local app and its background clock together. Both stop with this process.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? args[portIndex + 1] : '8787';
if (!/^\d+$/.test(port ?? '') || Number(port) < 1 || Number(port) > 65535)
  throw new Error('Choose a valid --port.');
const wrangler = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
    ),
    'dev',
    '--config',
    'dist/server/wrangler.json',
    '--local',
    '--test-scheduled',
    '--persist-to',
    '.wrangler/state',
    ...args,
  ],
  { stdio: 'inherit' },
);
let clock,
  stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clock?.kill('SIGTERM');
  wrangler.kill('SIGTERM');
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
wrangler.on('error', (error) => {
  console.error(error.message);
  stop(1);
});
wrangler.on('exit', (code) => stop(code ?? 0));
for (let attempt = 0; attempt < 90 && !stopping; attempt++) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/providers/http`, {
      signal: AbortSignal.timeout(1000),
    });
    if (r.ok) {
      clock = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('./local-clock.mjs', import.meta.url)),
          port,
          '--interval=15000',
        ],
        { stdio: 'inherit' },
      );
      clock.on('error', (error) =>
        console.error('Local scheduler:', error.message),
      );
      break;
    }
  } catch {
    /* Wait for this specific local app to be ready. */
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!clock && !stopping)
  console.error(
    'The local scheduler could not start. Restart Pomade after resolving the server error.',
  );
