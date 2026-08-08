# Settings Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a persistent CLI settings menu for general execution, proxy files, mail service, and GPM/Camoufox browser configuration.

**Architecture:** `src/core/config.ts` owns the typed schema, defaults, JSON load/merge/save, and validation helpers. `src/cli/settings.ts` owns only Inquirer prompts and updates an in-memory `AppConfig`, saving after each completed submenu. Runtime modules can later consume the config module without importing CLI code.

**Tech Stack:** TypeScript, Node `fs/promises`, `@inquirer/prompts`, Chalk, Vitest.

## Global Constraints

- Persist to human-readable UTF-8 `config.json` in the project directory.
- Defaults: threads `1`, delay `0.5`, GPM port `9495`, browser visible, proxy none, Camoufox default.
- Proxy modes are none, Kiot Proxy file, or normal proxy file; each file has one value per line.
- Service Mail choices are Hotmail/Outlook, Adguard Mail, and Gmail.
- Invalid JSON falls back to defaults without deleting the malformed file.
- `npm run build` must succeed.

### Task 1: Add config model and persistence tests

**Files:**
- Create: `src/core/config.ts`
- Create: `src/core/config.test.ts`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produce `AppConfig`, `DEFAULT_CONFIG`, `loadConfig(filePath?: string): Promise<AppConfig>`, and `saveConfig(config: AppConfig, filePath?: string): Promise<void>`.

- [ ] Write failing tests for defaults, missing file, partial merge, malformed JSON fallback, and save/load round trip.
- [ ] Run `npx vitest run src/core/config.test.ts`; confirm failure because the config module is absent.
- [ ] Implement typed defaults, recursive merge for nested config, UTF-8 indented JSON persistence, and malformed JSON fallback.
- [ ] Run the focused tests and confirm all pass.

### Task 2: Add input validation tests and helpers

**Files:**
- Modify: `src/core/config.ts`
- Modify: `src/core/config.test.ts`

**Interfaces:**
- Produce `validateThreads(value: string): string | true`, `validateDelay(value: string): string | true`, `validatePort(value: string): string | true`, and `validateTxtPath(value: string): string | true`.

- [ ] Write failing tests for invalid/valid thread count, delay, port range, and `.txt` path.
- [ ] Run the focused tests and confirm the new assertions fail for the expected missing helpers.
- [ ] Implement minimal validators with clear Vietnamese error messages.
- [ ] Run all config tests and confirm they pass.

### Task 3: Replace the settings prompt flow

**Files:**
- Modify: `src/cli/settings.ts`

**Interfaces:**
- Consume `AppConfig`, `loadConfig`, `saveConfig`, and validators from `src/core/config.ts`.
- Produce general, proxy, and browser submenu behavior with Back handling and immediate saves.

- [ ] Add failing integration-level tests only if the prompt library can be injected without brittle terminal mocks; otherwise retain focused config tests and perform a deterministic CLI smoke check.
- [ ] Implement top-level loading and submenu routing.
- [ ] Implement General prompts for threads, delay, Service Mail choices, and visible/hidden browser.
- [ ] Implement Proxy prompts for None, Kiot Proxy `.txt`, and normal proxy `.txt`, storing only `mode` and `filePath`.
- [ ] Implement Browser prompts for GPM port `9495`, Camoufox Default, and Camoufox custom boolean options.
- [ ] Save after each completed submenu and display concise success messages.
- [ ] Run `npm run build` and manually smoke-test Back, Exit, each proxy mode, each mail option, and both browser engines.

### Task 4: Final verification and documentation alignment

**Files:**
- Modify: `README.md` only if one exists and needs the settings usage documented.

- [ ] Run the complete test suite with `npx vitest run`.
- [ ] Run `npm run build`.
- [ ] Inspect the generated `config.json` shape from a smoke run and confirm secrets are not printed to console.
- [ ] Re-read the design spec and verify every acceptance criterion is covered.
