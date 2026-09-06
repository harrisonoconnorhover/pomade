import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { validCodexModels } from '../lib/codex-models.mjs';

// A metadata-only app-server session; it never starts a thread or research turn.
export function readCodexModels(binary, environment, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(
      binary,
      [
        'app-server',
        '--stdio',
        '-c',
        'forced_login_method="chatgpt"',
        '-c',
        'model_provider="openai"',
      ],
      {
        env: environment,
        cwd: tmpdir(),
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );
    const lines = createInterface({ input: child.stdout });
    let complete = false;
    let requestId = 1;
    const models = [];
    const cursors = new Set();
    const finish = (error, result) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      lines.close();
      child.kill();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(
      () => finish(new Error('Codex model discovery timed out.'), null),
      15_000,
    );
    const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
    child.on('error', () =>
      finish(new Error('The Codex model service could not start.'), null),
    );
    child.on('exit', () =>
      finish(new Error('Codex closed before returning its model list.'), null),
    );
    child.stdin.on('error', () =>
      finish(new Error('The Codex model connection closed.'), null),
    );
    lines.on('line', (line) => {
      try {
        const message = JSON.parse(line);
        if (message.id !== 0 && message.id !== requestId) return;
        if (message.error)
          throw new Error('Codex could not read the account model list.');
        if (message.id === 0) {
          send({ method: 'initialized', params: {} });
          send({
            id: requestId,
            method: 'model/list',
            params: { limit: 100, includeHidden: false },
          });
          return;
        }
        for (const model of message.result.data) {
          if (
            model.hidden ||
            (model.inputModalities && !model.inputModalities.includes('text'))
          )
            continue;
          models.push({
            id: model.model,
            name: model.displayName,
            isDefault: model.isDefault === true,
            defaultReasoningEffort: model.defaultReasoningEffort,
            efforts: model.supportedReasoningEfforts.map((e) => ({
              value: e.reasoningEffort,
              description: e.description,
            })),
          });
        }
        const cursor = message.result.nextCursor;
        if (cursor) {
          if (cursors.has(cursor) || models.length > 100)
            throw new Error('Invalid Codex model pagination.');
          cursors.add(cursor);
          send({
            id: ++requestId,
            method: 'model/list',
            params: { limit: 100, includeHidden: false, cursor },
          });
        } else {
          if (!validCodexModels(models))
            throw new Error('Codex returned an unsupported model catalog.');
          finish(null, models);
        }
      } catch (error) {
        finish(error, null);
      }
    });
    send({
      id: 0,
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'pomade_research',
          title: 'Pomade research',
          version: '0.1.0',
        },
      },
    });
  });
}
