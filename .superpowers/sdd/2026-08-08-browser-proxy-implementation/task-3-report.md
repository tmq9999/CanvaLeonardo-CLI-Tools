# Task 3 report: GPM Login client and profile scope

## Changed files

- `src/services/gpmlogin.ts`: adds the injected-transport GPM client, typed connection and profile-scope errors, group selection, group-scoped profile lifecycle calls, and CDP endpoint extraction.
- `src/services/gpmlogin.test.ts`: mocked HTTP diagnostics for connection, group listing, one-group enforcement, and group-scoped profile operations.

`src/core/config.ts` was not changed because it already persists `gpmPort`, `gpmGroupId`, and `gpmGroupName` with migration-safe defaults.

## Verification output

```text
$ node --import tsx --test src/services/gpmlogin.test.ts
tests 5
pass 5
fail 0

$ npm run build
> canvaleonardo@1.0.0 build
> tsc

$ npm test
tests 15
pass 15
fail 0
```

## Concerns

- The actual GPM Login health/profile endpoint and response variants must be confirmed against the user's installed GPM version before relying on the client outside mocked diagnostics.
- Existing Task 2 changes under `dist/` and its untracked review/test artifacts were preserved and are not part of this task's commit.

## Live verification status

Unverified. No real user-provided GPM port was connected and no health, group, profile CRUD, start, stop, or CDP response was captured.

## Follow-up: standard test coverage fix

The original `npm test` script enumerated only config, proxy, and Kiot tests, so it executed 15 tests and omitted the five GPM client diagnostics. It now invokes Node's `src/**/*.test.ts` glob and discovers every current source test.

```text
$ npm test
tests 20
pass 20
fail 0

$ npm run build
> canvaleonardo@1.0.0 build
> tsc
```

`package-lock.json` was not changed because this script-only edit does not alter dependencies. Live GPM verification remains unverified; no port or response was captured.
