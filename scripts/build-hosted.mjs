// Build from source in a clean temporary directory. Never overwrite the local
// preview artifact or copy local credentials into the deployment build.
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const stage = await mkdtemp(join(tmpdir(), 'pomade-hosted-build-'));
try {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  for (const file of new Set(files)) {
    if (
      file
        .split('/')
        .some((part) => part.startsWith('.env') && part !== '.env.example')
    )
      continue;
    await mkdir(dirname(join(stage, file)), { recursive: true });
    await cp(join(root, file), join(stage, file));
  }
  await symlink(join(root, 'node_modules'), join(stage, 'node_modules'), 'dir');
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/vinext/dist/cli.js'),
      'build',
      '--mode',
      'hosted',
    ],
    {
      cwd: stage,
      env: process.env,
      stdio: 'inherit',
    },
  );
  if (result.status !== 0)
    throw new Error(
      'Hosted build failed; the local preview was left untouched.',
    );
  const output = join(root, 'dist-hosted');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const dir of ['dist', '.openai', 'drizzle'])
    await cp(join(stage, dir), join(output, dir), { recursive: true });
  console.log(
    'Hosted artifact: dist-hosted/dist. The local dist/ build is unchanged.',
  );
} finally {
  await rm(stage, { recursive: true, force: true });
}
