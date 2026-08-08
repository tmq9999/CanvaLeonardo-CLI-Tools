# Task 5 report: browser settings and proxy runtime wiring

## Changed files

- `src/cli/settings.ts`: GPM port verification, immediate connection and group loading, one-group persistence, and retry/back flow.
- `src/cli/settings.test.ts`: settings orchestration diagnostics for retry, single-group selection, and failed group load.
- `src/core/workers.ts`: common `ProxyManager` and adapter factory for Chromium, Camoufox, and group-scoped GPM.
- `src/core/script.ts`: common runtime lifecycle that resolves proxy input before launch, closes browser sessions, and releases Kiot keys in `finally` without replacing a primary failure.
- `src/core/script.test.ts`: direct/Kiot resolution, shared-adapter orchestration, and primary-error-preserving cleanup diagnostics.
- `src/utils/menu.ts`: Start menu action loads the saved config and invokes the common browser runtime.

## Commands and results

```text
node --import tsx --test src/cli/settings.test.ts src/core/script.test.ts
Exit 0: 5 passing, 0 failing.

npm run build
Exit 0: tsc completed successfully.

npm test
Exit 0: 31 passing, 0 failing.

git diff --check
Exit 0: no whitespace errors.
```

## Live verification status

Unverified. This task did not connect to a real GPM Login port, call Kiot Proxy with a real key, launch Chromium/Camoufox/GPM, navigate a browser, capture API/CDP responses, or capture external-IP evidence. The automated results above use injected adapters and clients only.

## Scope and concerns

- The active menu now invokes the runtime, but it has no task-specific browser automation; the common runtime accepts a task callback for future automation.
- GPM runtime launch still requires a profile ID supplied by that future task flow; Task 5 persists and validates only the required port/group settings.
- Existing `dist/` changes and prior task review files remain unstaged and untouched.
