import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
await mkdir(new URL('dist/server/', root), { recursive: true });
await copyFile(
  new URL('worker.mjs', root),
  new URL('dist/server/index.js', root),
);
await writeFile(
  new URL('dist/server/wrangler.json', root),
  JSON.stringify(
    {
      name: 'pomade-apollo-callback',
      main: 'index.js',
      compatibility_date: '2026-09-01',
      observability: { enabled: false },
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Built callback Worker:',
  fileURLToPath(new URL('dist/server/index.js', root)),
);
