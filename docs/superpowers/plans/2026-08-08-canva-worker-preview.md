# Canva Worker Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live-preview worker flow that opens the configured number of real browsers on an invite URL, distributes direct/Kiot proxies round-robin, and lets the user inspect the browsers before cleanup.

**Architecture:** Keep browser-specific adapters unchanged. Add a small Canva page task, a worker orchestrator that launches all sessions concurrently and owns cleanup, and a menu flow that collects the invite URL and waits for Enter only after every browser has navigated. Extend proxy resolution with a Kiot `ttc`-aware new/current fallback and round-robin assignment.

**Tech Stack:** TypeScript, Node test runner invoked directly with `node --import tsx --test`, Playwright/Camoufox/GPM adapters, `@inquirer/prompts`, existing `logger.ts`.

## Global Constraints

- Live verification must use the exact URL `https://canva.com/`.
- Live verification must configure `general.parallelThreads = 3` and confirm three real browser sessions navigate successfully.
- Do not use `npm test` or `npm run build` as verification commands.
- New worker/menu output must use `src/utils/logger.ts` and Vietnamese messages.
- Preserve existing settings schema and browser adapter contracts.
- Direct and Kiot proxy entries must be assigned round-robin.
- Kiot rotation must use `/proxies/new` when possible and fallback to `/proxies/current` when `ttc > 0` or the API rejects rotation because countdown has not elapsed.

---

### Task 1: Define the Canva page task

**Files:**
- Modify: `src/utils/browser.ts` only if the page contract needs a typed `goto` method
- Create: `src/core/canva.test.ts`
- Modify: `src/core/canva.ts`

**Interfaces:**
- Consumes: `BrowserSession.page`, invite URL, and `logger`.
- Produces: `openCanvaInvite(session: BrowserSession, inviteUrl: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create a test with a real in-memory page object implementing `goto(url)` and assert `openCanvaInvite()` passes the exact URL to it.

- [ ] **Step 2: Run the focused test directly**

Run: `node --import tsx --test src/core/canva.test.ts`

Expected: FAIL because `openCanvaInvite` is not implemented.

- [ ] **Step 3: Implement the minimal page task**

Validate the URL with `new URL()` and require `http:` or `https:`. Call `page.goto(inviteUrl)` and emit Vietnamese success/error output through `logger`.

- [ ] **Step 4: Run the focused test directly**

Run: `node --import tsx --test src/core/canva.test.ts`

Expected: PASS with no production console calls outside `logger`.

### Task 2: Implement Kiot `ttc`-aware proxy resolution

**Files:**
- Create: `src/services/kiotproxy.test.ts`
- Modify: `src/services/kiotproxy.ts`
- Modify: `src/core/runtime-adapters.ts` only for dependency injection needed by worker orchestration

**Interfaces:**
- Consumes: Kiot API response metadata fields `http` and `ttc`.
- Produces: a resolved proxy plus metadata that allows the worker to distinguish rotation availability.

- [ ] **Step 1: Write the failing tests**

Cover these real client behaviors with an injected fetch implementation: `/new` success returns a new `http` proxy and numeric `ttc`; countdown rejection is distinguishable from invalid-key/network failure; `/current` returns the current proxy; `release()` remains idempotent.

- [ ] **Step 2: Run the focused tests directly**

Run: `node --import tsx --test src/services/kiotproxy.test.ts`

Expected: FAIL on the missing `ttc`/countdown behavior.

- [ ] **Step 3: Implement minimal metadata and countdown handling**

Keep metadata as the API response data, expose numeric `ttc` when present, and add a narrow predicate for countdown rejection based on the documented Kiot response rather than treating every API error as fallback-eligible.

- [ ] **Step 4: Run the focused tests directly**

Run: `node --import tsx --test src/services/kiotproxy.test.ts`

Expected: PASS.

### Task 3: Build worker orchestration and round-robin assignment

**Files:**
- Create: `src/core/workers.test.ts`
- Modify: `src/core/workers.ts`
- Modify: `src/core/runtime-adapters.ts` if a narrow injectable resolver is required

**Interfaces:**
- Consumes: `AppConfig`, invite URL, `BrowserAdapter`, `ProxyManager`/proxy resolver, and Enter confirmation callback.
- Produces: `runCanvaWorkers(config, inviteUrl, options): Promise<void>` that launches all configured sessions concurrently, opens the URL, waits for confirmation, then cleans up.

- [ ] **Step 1: Write failing orchestration tests**

Use injected fake adapter/client dependencies, not production browser launches, and assert: `parallelThreads` sessions are launched; entries are assigned with `index % entries.length`; task receives the invite URL; one failed launch cleans up sessions already opened; confirmation closes all sessions and releases each used Kiot key once.

- [ ] **Step 2: Run the focused tests directly**

Run: `node --import tsx --test src/core/workers.test.ts`

Expected: FAIL because worker orchestration is not implemented.

- [ ] **Step 3: Implement concurrent worker launch**

Create the adapter once, resolve/normalize proxy entries, assign round-robin, call `adapter.launch()` for every worker, then call `openCanvaInvite()` for each session. Do not wait indefinitely: invoke the injected confirmation callback after all workers finish navigation.

- [ ] **Step 4: Implement cleanup and error aggregation**

Close every opened session in `finally`, release used Kiot keys once, preserve the primary launch/navigation error, and log worker-specific failures in Vietnamese through `logger`.

- [ ] **Step 5: Run the focused tests directly**

Run: `node --import tsx --test src/core/workers.test.ts`

Expected: PASS.

### Task 4: Connect menu input and logger output

**Files:**
- Create: `src/utils/menu.test.ts` only if the prompt flow can be injected without brittle terminal automation
- Modify: `src/utils/menu.ts`
- Modify: `src/utils/logger.ts` only if a missing Vietnamese output level is needed

**Interfaces:**
- Consumes: `input()` for `Nhập link invite canva: ` and Enter confirmation.
- Produces: menu start flow that calls `runCanvaWorkers()` and reports errors with `logger.error()`.

- [ ] **Step 1: Write the failing menu-flow test if injectable**

Assert the start action passes the entered URL to the worker runner and does not call the old placeholder runtime callback.

- [ ] **Step 2: Run the focused test directly**

Run: `node --import tsx --test src/utils/menu.test.ts`

Expected: FAIL until the start flow is wired.

- [ ] **Step 3: Implement the menu flow**

Use `@inquirer/prompts` input with the exact Vietnamese prompt, load fresh config, run workers, show the inspection instruction only after all workers navigate, and return to the main menu after cleanup.

- [ ] **Step 4: Run focused tests directly**

Run: `node --import tsx --test src/utils/menu.test.ts`.

Expected: PASS if the injectable test exists; otherwise verify this behavior in the live run in Task 5.

### Task 5: Live end-to-end verification

**Files:**
- Modify: `config.json` only if required for the live test, preserving the user's original value afterward

- [ ] **Step 1: Prepare real settings**

Set `general.parallelThreads` to `3`, select a working configured browser engine and proxy mode, and ensure the required browser/runtime service is available.

- [ ] **Step 2: Start the real application**

Run the real dev entrypoint: `npm run dev`.

This is permitted for runtime execution; do not run `npm test` or `npm run build`.

- [ ] **Step 3: Drive the real prompt**

Choose `Bắt đầu` and enter exactly `https://canva.com/`.

- [ ] **Step 4: Confirm all three browser sessions**

Record the actual output for worker 1, 2, and 3; inspect each real browser; confirm each final URL is `https://canva.com/` (or the site's actual canonical redirect) and each navigation has a successful response.

- [ ] **Step 5: Confirm cleanup**

Press Enter in the real prompt and confirm all three browsers close and Kiot/direct proxy resources are handled as designed.

- [ ] **Step 6: Report evidence**

Report the real command, worker count, final URLs, response statuses, browser cleanup, and any limitation. Do not claim completion if any one of the three sessions fails or if runtime evidence is unavailable.
