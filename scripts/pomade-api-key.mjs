#!/usr/bin/env node
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const scopes = ['read', 'run', 'crm:read', 'crm:write'];
export async function manageApiKey(
  args,
  root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
) {
  const [command, argument, flag, scopeList] = args;
  if (!['create', 'list', 'revoke'].includes(command))
    throw new Error(
      'Usage: npm run api:key -- create NAME [--scopes read,run,crm:read,crm:write] | list | revoke ID',
    );
  const envPath = resolve(root, '.env.local');
  let envText = '';
  try {
    envText = await readFile(envPath, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const keys = JSON.parse(parseEnv(envText).POMADE_API_KEYS || '[]');
  if (!Array.isArray(keys))
    throw new Error('POMADE_API_KEYS must be a JSON array.');
  if (command === 'list')
    return { keys: keys.map(({ id, name, scopes }) => ({ id, name, scopes })) };
  let created;
  if (command === 'create') {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,79}$/.test(argument ?? '') ||
      args.length > 4 ||
      (flag && flag !== '--scopes') ||
      (flag && !scopeList)
    )
      throw new Error(
        'Use a key name with letters, numbers, spaces, dots, dashes or underscores, and an optional --scopes list.',
      );
    if (keys.length >= 50)
      throw new Error('Revoke an unused key before creating another.');
    const selected = [
      ...new Set(['read', ...(scopeList ? scopeList.split(',') : [])]),
    ];
    if (selected.some((s) => !scopes.includes(s)))
      throw new Error(`Allowed scopes: ${scopes.join(', ')}`);
    const id = randomBytes(8).toString('hex');
    const token = `pomade_${id}_${randomBytes(32).toString('base64url')}`;
    keys.push({
      id,
      name: argument.trim(),
      sha256: createHash('sha256').update(token).digest('hex'),
      scopes: selected,
    });
    const output = resolve(root, 'outputs/api-keys');
    await mkdir(output, { recursive: true, mode: 0o700 });
    const clientEnv = resolve(output, `${id}.env`);
    const mcpConfig = resolve(output, `${id}.mcp.json`);
    await writeFile(
      clientEnv,
      `POMADE_API_URL=http://127.0.0.1:8798\nPOMADE_API_KEY=${token}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    await writeFile(
      mcpConfig,
      JSON.stringify(
        {
          mcpServers: {
            pomade: {
              command: process.execPath,
              args: [
                `--env-file=${clientEnv}`,
                resolve(root, 'scripts/pomade-mcp.mjs'),
              ],
            },
          },
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    created = {
      id,
      name: argument.trim(),
      scopes: selected,
      clientEnv,
      mcpConfig,
    };
  } else {
    if (args.length !== 2 || !keys.some((k) => k.id === argument))
      throw new Error('Choose an existing key ID from the list command.');
    keys.splice(
      keys.findIndex((k) => k.id === argument),
      1,
    );
  }
  const line = `POMADE_API_KEYS='${JSON.stringify(keys)}'`;
  envText = /^POMADE_API_KEYS=/m.test(envText)
    ? envText.replace(/^POMADE_API_KEYS=.*$/m, () => line)
    : `${envText.trimEnd()}\n${line}\n`;
  await writeFile(envPath, envText, { mode: 0o600 });
  await chmod(envPath, 0o600);
  return {
    ...(created ?? { revoked: argument }),
    next: 'Rebuild Pomade and restart its local server to activate this change. Keep client credential files private.',
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  manageApiKey(process.argv.slice(2))
    .then((value) => console.log(JSON.stringify(value, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
