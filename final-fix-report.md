# Final fix report

Date: 2026-08-08
Branch: `codex/browser-proxy-implementation`

## Review input and scope

The requested `final-review.md` was not present in the worktree, in `HEAD`, anywhere under the repository root, or in git history. No final-review content was inferred or fabricated. This pass used the three explicit blockers in the request and the available task review files as its evidence base.

Only these load-bearing blockers were changed:

1. Commit generated `dist` output that represents current `src`, while preserving user-owned `dist/index.js` content.
2. Release Kiot, browser/context, and GPM resources on partial failure paths.
3. Persist a GPM profile ID and pass it from saved CLI configuration into runtime launch.

The lower-priority Task 4 observations about broadening `BrowserPage` typing and selecting an existing/default CDP context were intentionally left out of scope.

## Fixes

### Source-matching distribution

- Ran `npm run build` to regenerate checked-in TypeScript output under `dist`.
- `dist/index.js` SHA-256 before and after build remained exactly `9BCF9733092AD851009CE0A3B7E54B13EF63AF404A0048F775DF6E91FEE419F9`.
- `git diff --exit-code -- dist/index.js` returned exit 0, so `dist/index.js` has no content change and is not included in this fix.
- The unchanged entry point imports `dist/utils/menu.js`; that module and its runtime dependencies now contain current compiled behavior.

### Partial-failure cleanup

- `ProxyManager.resolveAll()` now tracks resolution sequentially. If a later input fails, every earlier resolved Kiot key is released before the original resolution error is rethrown.
- Browser session setup now closes a created context and the browser when `newPage()` fails, and closes the browser when `newContext()` fails.
- Cleanup attempts continue after an individual cleanup error; cleanup diagnostics are retained with the primary setup error.
- GPM now awaits session setup inside its launch `try/catch`. A post-CDP session failure therefore closes connected browser resources and then stops the already-started profile.

Regression tests were first observed failing with these missing effects:

- partial Kiot resolution released `[]` instead of `kiot-key-1`;
- Chromium page/context setup failures made no browser/context close calls;
- GPM page creation failure closed neither browser resources nor the started profile.

The focused lifecycle suite then passed 15/15 after the fixes.

### Persisted GPM profile ID

- Added migration-safe `browser.gpmProfileId` configuration.
- GPM settings now asks for a profile ID after one group is selected, trims it, rejects blank input, and persists it with the GPM port/group.
- `runBrowserRuntime()` now passes the saved profile ID to adapter launch. The existing explicit runtime option remains an override.
- Updated browser/proxy usage documentation to describe the actual CLI flow.

The profile-ID regressions were first observed failing in three places: settings omitted the ID, blank input saved an unlaunchable GPM configuration, and runtime launched without `profileId`. The focused config/settings/runtime suite then passed 11/11 after the fix.

## Fresh verification

```text
npm test
Exit 0: 39 passed, 0 failed.

npm run build
Exit 0: TypeScript build completed.

git diff --check
Exit 0: no whitespace errors.

git diff --exit-code -- dist/index.js
Exit 0: no dist/index.js content change.
```

Safe compiled-output Chromium smoke:

```text
Adapter: chromium (from dist/utils/browser.js)
Navigation: data:text/plain,dist-smoke
Observed body: dist-smoke
Exit 0; adapter close completed.
```

Safe read-only GPM health check:

```text
GET http://127.0.0.1:9495/api/v1
{"success":true,"data":"GPMLogin Global API","message":null,"sender":"GPMLoginGlobal v0.3.0-beta"}
```

This confirms the local GPM API was reachable at verification time. It does not prove profile start, CDP attachment, navigation, or stop behavior for a real configured profile.

## Explicitly unverified

- No Kiot key was provided or configured, so no live Kiot resolve/release request was made.
- No live direct-proxy endpoint was provided or configured, so no direct-proxy routing or external-IP comparison was made.
- The saved `config.json` selects Camoufox and contains no real GPM profile ID. No GPM profile start/stop or CDP browser lifecycle was attempted, avoiding mutation of an unidentified user profile.
- No credentialed or full live browser/proxy E2E claim is made.
- Interactive `npm start` was not automated because it enters the update/menu flow. The compiled adapter used by that entry path was exercised directly with a local `data:` navigation as the safe runtime check.
