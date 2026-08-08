# Browser and Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the shared proxy pipeline and selectable Chromium, Camoufox, and GPM Login browser adapters described in the approved design spec.

**Architecture:** Keep parsing/resolution in `ProxyManager`, browser lifecycle behind a `BrowserAdapter` contract, and GPM connection/group/profile operations in a dedicated client. Extend the existing config/settings menu with Chromium as the default and a single validated GPM group selection.

**Tech Stack:** TypeScript ESM, Node.js, Playwright (add `playwright` dependency), existing `camoufox-js`, `@inquirer/prompts`, Node test runner, `tsx`.

## Global Constraints

- Chromium Chrome via Playwright is the default browser.
- Camoufox and GPM Login are optional runtime choices.
- Every non-empty proxy input line represents one proxy or Kiot Proxy key; blank lines are ignored.
- Missing proxy scheme defaults to `http://`.
- Exactly one GPM group may be selected.
- GPM connection/group-load failures block profile CRUD and return to retryable settings flow.
- Proxy fields and proxy keys may be logged in full; proxy passwords are one-time passwords.
- Existing unrelated `dist/index.js` changes must not be staged or overwritten.
- A feature is not considered passed from static checks, `npm test`, or `npm run build` alone; every claim of success requires captured runtime responses from the real integration under test.
- If a live dependency is unavailable, report the verification as blocked/unverified; never replace it with a fabricated result or treat a mock-only result as live success.

---

## File map

- Modify `src/core/config.ts`: browser enum, GPM group configuration, proxy input configuration, defaults, migration-safe merge.
- Modify `src/core/config.test.ts`: config defaults, merge, and validation coverage.
- Modify `src/utils/proxy.ts`: normalized proxy types and four-format parser.
- Create `src/utils/proxy.test.ts`: parser and file-line tests.
- Modify `src/services/kiotproxy.ts`: Kiot HTTP client and normalized key resolution/release.
- Create `src/services/kiotproxy.test.ts`: mocked API behavior and cleanup release.
- Modify `src/services/gpmlogin.ts`: port client, connection test, group listing, single-group profile CRUD/start/stop.
- Create `src/services/gpmlogin.test.ts`: mocked GPM API behavior.
- Modify `src/utils/browser.ts`: common browser session and adapter contract.
- Create `src/utils/browser.test.ts`: adapter selection and shared lifecycle tests.
- Modify `src/cli/settings.ts`: Chromium default, GPM connection/group selection flow, and persisted settings.
- Modify `src/cli/menu.ts` or `src/utils/menu.ts` only where the runtime browser/proxy selection entry point is currently wired.
- Modify `src/core/workers.ts` and `src/core/script.ts` only to consume the common browser/proxy interfaces; do not add browser-specific task branches.
- Modify `package.json` and `package-lock.json`: add Playwright.

### Task 1: Establish config and proxy contracts

**Files:**
- Modify: `src/core/config.ts`
- Modify: `src/core/config.test.ts`
- Modify: `src/utils/proxy.ts`
- Create: `src/utils/proxy.test.ts`

**Interfaces:**
- Produces `BrowserEngine = "chromium" | "camoufox" | "gpm"`.
- Produces `ProxyInput = { kind: "proxy" | "kiot-key"; value: string; line: number }`.
- Produces `NormalizedProxy = { scheme: string; host: string; port: number; username?: string; password?: string; source: string }`.
- Produces `parseProxyLine(line: string, lineNumber: number): ProxyInput | ParseError` and `parseProxyFile(content: string): ProxyInput[]`.

- [ ] Write failing tests for all four forms, default `http://`, blank lines, invalid ports, and line-numbered errors.
- [ ] Update config defaults so `browser.engine` is `chromium`; add nullable/optional `gpmGroupId` and `gpmGroupName` without breaking old `config.json` files.
- [ ] Implement deterministic parsing: recognize a supported scheme only when the first token is a scheme, otherwise parse `host:port[:user:pass]`; reject malformed token counts instead of treating them as keys.
- [ ] Run unit/build checks as secondary diagnostics, then execute a real parser/runtime smoke flow with an actual `.txt` file and capture the returned normalized proxy objects and line errors. Do not mark the task passed from unit/build output alone.
- [ ] Commit: `feat: add browser and proxy configuration contracts`.

### Task 2: Implement Kiot Proxy resolution

**Files:**
- Modify: `src/services/kiotproxy.ts`
- Create: `src/services/kiotproxy.test.ts`

**Interfaces:**
- Consumes `ProxyInput` with `kind: "kiot-key"`.
- Produces `KiotProxyClient.current(key)`, `newProxy(key, region)`, `release(key)` and `resolve(key, options): Promise<ResolvedKiotProxy>`.

- [ ] Write mocked `fetch` tests for success, `success: false`, missing `data.http`, and release failure.
- [ ] Implement one HTTP request helper against the documented Kiot endpoints, preserving Kiot `code`, `message`, and response metadata.
- [ ] Convert `data.http` (`host:port`) to `NormalizedProxy` with `http` scheme and reject missing/invalid fields.
- [ ] Ensure release is idempotent and report cleanup errors without replacing the primary task error.
- [ ] Run mocked tests as secondary diagnostics, then call the real Kiot endpoint with a user-provided valid key, capture the actual HTTP response, verify the resolved proxy fields, and call release while capturing its actual response. If credentials or network access are unavailable, mark live verification unverified.
- [ ] Commit: `feat: add kiot proxy key resolver`.

### Task 3: Implement GPM Login client and profile scope

**Files:**
- Modify: `src/services/gpmlogin.ts`
- Create: `src/services/gpmlogin.test.ts`
- Modify: `src/core/config.ts` if the persisted profile fields require a focused type adjustment.

**Interfaces:**
- Produces `GpmLoginClient(port)` with `connect()`, `listGroups()`, `createProfile(input)`, `updateProfile(id, input)`, `deleteProfile(id)`, `startProfile(id)`, and `stopProfile(id)`.
- `GpmSettings = { port: number; groupId: string; groupName: string }`.
- Every profile CRUD request receives the configured `groupId`; no method accepts an arbitrary second group.

- [ ] Write mocked API tests for connection success/failure, group-load failure, one selected group, and CRUD requests containing that group ID.
- [ ] Implement connection health check against the configured GPM port and throw a typed connection error on network/API failure.
- [ ] Implement group listing as a distinct operation; never convert a failed request into `[]`.
- [ ] Implement profile CRUD/start/stop with explicit group scoping and return the profile start/CDP data needed by the browser adapter.
- [ ] Run mocked tests as secondary diagnostics, then connect to the real GPM Login port, capture the health response, capture the real group list, select exactly one real group, and verify a real profile CRUD/start/stop round trip in that group. If GPM is unavailable, mark live verification unverified.
- [ ] Commit: `feat: add gpm login client and group-scoped profiles`.

### Task 4: Implement shared browser adapters

**Files:**
- Modify: `src/utils/browser.ts`
- Create: `src/utils/browser.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `BrowserAdapter.launch(options): Promise<BrowserSession>` and `close(session): Promise<void>`.
- Produces adapters `ChromiumPlaywrightAdapter`, `CamoufoxAdapter`, and `GpmLoginAdapter`.
- `BrowserSession` exposes the common page/context handle plus cleanup metadata; task code does not access adapter internals.

- [ ] Add Playwright and write adapter-selection tests using injected launch factories, so tests do not launch real browsers.
- [ ] Implement Chromium launch with Playwright and normalized proxy fields; use visible mode from config unless runtime overrides it.
- [ ] Implement Camoufox launch mapping normalized proxy and Camoufox options without leaking Camoufox-specific branches into task code.
- [ ] Implement GPM launch by starting the configured profile and connecting to its returned endpoint; stop the profile during close.
- [ ] Run adapter tests/build as secondary diagnostics, then launch each enabled adapter in a real runtime: Chromium, Camoufox, and GPM when configured. Capture browser process/CDP response, navigate to a real diagnostic page, and verify the observed external IP matches the resolved proxy where proxy routing is in scope. Do not call an adapter passed without this evidence.
- [ ] Commit: `feat: add shared browser adapters`.

### Task 5: Wire settings and runtime selection

**Files:**
- Modify: `src/cli/settings.ts`
- Modify: `src/cli/menu.ts` or `src/utils/menu.ts`
- Modify: `src/core/workers.ts`
- Modify: `src/core/script.ts`

**Interfaces:**
- Settings persists `browser.engine`, GPM port/group, proxy mode/file, and existing Camoufox options.
- Runtime creates one `ProxyManager`, resolves each input, selects one `BrowserAdapter`, and passes only `BrowserLaunchOptions` to task code.

- [ ] Add Chromium to the browser menu and make it the default for new and migrated configs.
- [ ] After GPM port input, connect immediately; on failure show a retryable connection error and do not save a usable GPM configuration.
- [ ] On success load groups and present a single-select prompt; persist exactly one `groupId` and `groupName`.
- [ ] Add runtime proxy-file loading and resolve direct proxies or Kiot keys before launch.
- [ ] Replace browser-specific worker branches with the shared manager; guarantee `close()` and Kiot release in `finally`.
- [ ] Run the full test suite as secondary diagnostics, then manually exercise the actual menu/runtime with real GPM/Kiot services and a real proxy input file. Capture prompts, API responses, browser launch, navigation, cleanup, and Kiot release. Mocks may supplement debugging but cannot satisfy live acceptance.
- [ ] Commit: `feat: wire browser and proxy runtime flows`.

### Task 6: Verification and documentation

**Files:**
- Modify: `README.md` if present, otherwise create `docs/browser-proxy-usage.md`.
- Modify: `package.json` only if test scripts need a stable full-suite command.

- [ ] Document all proxy line formats, Kiot key input, browser defaults, and GPM single-group setup.
- [ ] Run `npm test` and `npm run build` only as secondary diagnostics.
- [ ] Perform an end-to-end live verification with real services: read a real `.txt` file, resolve a direct proxy and a Kiot key, launch the selected browser, navigate to a real external-IP endpoint, confirm the observed response, close the browser/profile, and confirm Kiot release response.
- [ ] Store the exact commands, timestamps, redacted credentials, HTTP status/body fields, browser/CDP evidence, and observed results in the handoff. A missing response means `unverified`, not `passed`.
- [ ] Verify the pre-existing `dist/index.js` change remains unstaged and unchanged by the feature work.
- [ ] Commit: `docs: document browser and proxy setup`.
