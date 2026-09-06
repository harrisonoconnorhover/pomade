# Morning Handoff

## Finished

- Added account-backed model and reasoning-effort selectors to new research columns, column settings and recipe settings.
- Added shared ChatGPT research defaults for each installation, with optional column overrides.
- Preserved settings in saved recipes and the hosted companion queue.
- Recorded model and effort in receipts; cached results remain separate by model, effort and browser mode.
- Updated the running local app and privately published Sites version 12 from `f125626`. Unsupported settings preserve previous answers.

## Try It

- Open **Add AI web research → Research settings**, or edit an existing research column. Keep **Use app defaults**, or choose its model and effort.
- Expand **ChatGPT research defaults** to save shared preferences or refresh account models. Also available under **Load data**.
- Inspect **Research model controls — check** [locally](http://localhost:8798/?table=ac31d85b-4265-4ed4-8c72-ae0e64dd24e0) or on the [private site](https://pomade.deleteddeleted.chatgpt.site/?table=41d8f4d7-a7c5-40ae-9680-6788af631910). See [setup and model selection](docs/codex-research.md).

## Checks

- 50 focused tests across eight files passed; typecheck, lint, diff whitespace checks and final local/hosted builds passed.
- Live account discovery returned seven models and supported efforts without starting a research turn.
- Local research inherited Luna/low defaults; hosted research used a Luna/low column override over Sol/medium defaults. Each visited HealthEdge's website and returned an answer with a citation. Both cached reruns retained the selected model and effort.
- Unsupported Luna/ultra defaults returned HTTP 400 on both installations. A local invalid-column run retained the previous answer and recorded zero credits. Original app defaults were restored.
- Private deployment succeeded with the database migration. Verification used functional HTTP checks and a static picker-render test, with no interactive browser QA of Pomade.

## Decisions

- Discover available models from Codex instead of hardcoding names or effort levels.
- Unset defaults follow the account default model and its default effort. Local and hosted preferences are independent.
- Change shared defaults between batches; explicit column overrides remain independent.

## Remaining

- Hosted subscription research still needs the Mac helper and companion running.
- Higher effort may take longer and use more allowance; existing research timeouts remain in effect.

## Review First

- `components/codex-research-settings.tsx` and `app/api/providers/research/settings/route.ts`.
- `scripts/codex-model-catalog.mjs`, helper settings and companion transport.
- `app/api/runs/route.ts`: resolution, cache identity and receipts.
