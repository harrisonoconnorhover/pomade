# Morning Handoff

## Finished

- Added account-backed model and reasoning-effort selectors to new research columns, column settings and recipe settings.
- Added shared ChatGPT research defaults for each Pomade installation, with optional column overrides.
- Carried settings through saved recipes and the hosted research companion; older companions cannot claim jobs requiring these settings.
- Added model and effort to research receipts and separated cached results by model, effort and browser mode.
- Unsupported settings require review and preserve the previous answer.

## Try It

- Open **Add AI research**, or edit an existing research column. Keep **Use app defaults**, or choose its model and effort.
- Expand **ChatGPT research defaults** to set shared defaults or refresh account models. These controls are also under **Load data**.
- See [research setup and model selection](docs/codex-research.md). Restart the local helper and hosted companion after updating.

## Checks

- 50 focused tests across eight files passed; typecheck, lint and diff whitespace checks passed.
- Account discovery returned seven models and their supported effort levels through the signed-in Codex account, without starting a research turn.
- Local and hosted builds passed before final receipt-error polish. Final rebuild, live research and private deployment verification are pending.
- Functional HTTP checks are planned; no interactive browser QA of Pomade was requested.

## Decisions

- Discover available models from Codex instead of maintaining a hardcoded list.
- Unset defaults follow the account default model and its default effort. Each installation saves its own preferences.
- Change shared defaults between batches; explicit column overrides remain independent.

## Remaining

- Finish live local and hosted research, cache verification and private publication.
- Higher effort may take longer and use more subscription allowance; existing research timeouts still apply.

## Review First

- `components/codex-research-settings.tsx` and `app/api/providers/research/settings/route.ts`.
- `scripts/codex-model-catalog.mjs`, helper settings and companion transport.
- `app/api/runs/route.ts`: resolution, cache identity and receipts.
