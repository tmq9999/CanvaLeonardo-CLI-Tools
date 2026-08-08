# Browser and Proxy Design Specification

## Status

Draft for user review.

## Goal

Build a shared browser and proxy foundation for the tool. Chromium Chrome through Playwright is the default browser. Camoufox and GPM Login are selectable alternatives for users who need a browser with stronger anti-detection characteristics or managed fingerprints.

The design must keep browser selection, proxy parsing, Kiot Proxy key resolution, and GPM Login profile management separate so each part can be tested and changed independently.

## User-facing behavior

### Browser selection

The menu/runtime flow offers:

1. Chromium Chrome via Playwright (default).
2. Camoufox.
3. GPM Login.

The selected browser is passed into a common browser manager. Task code must not depend directly on a specific browser implementation.

### Proxy input

The user selects a `.txt` input file. Each non-empty line represents exactly one proxy or one Kiot Proxy key. Blank lines are ignored. Parsing errors identify the line number and value without silently changing malformed input.

Supported proxy forms are:

```text
scheme:host:port:user:pass
scheme:host:port
host:port:user:pass
host:port
```

When the scheme is omitted, the parser adds `http://`. A scheme is preserved when supplied. The parser returns a normalized proxy object containing scheme, host, port, and optional credentials, plus the original input for diagnostics.

The parser must distinguish proxy lines from Kiot Proxy keys using an explicit input mode or a documented key-detection rule. It must not interpret an invalid proxy as a Kiot key accidentally.

Proxy fields, including the one-time proxy password, may be logged in full as requested. Proxy keys may also be logged in full.

### Kiot Proxy keys

A Kiot Proxy key is resolved before browser launch through the documented API:

- Current proxy: `GET /api/v1/proxies/current?key=...`
- New/change proxy: `GET /api/v1/proxies/new?key=...&region=...`
- Release proxy: `GET /api/v1/proxies/out?key=...`

The resolver returns a normalized HTTP proxy suitable for the selected browser. It must validate the API response status and required proxy fields, surface Kiot error codes/messages, and preserve enough response metadata for TTL/next-change handling. Release is attempted during session cleanup when the key was acquired by the current run.

## Architecture

```text
Menu / Runtime configuration
          |
          v
    BrowserManager -------- ProxyManager
          |                       |
          +-- Chromium adapter    +-- Direct proxy parser
          +-- Camoufox adapter    +-- Kiot key resolver
          +-- GPM adapter
          |
          v
    Common BrowserSession
```

### Browser interface

The shared interface owns launch and cleanup lifecycle. A conceptual contract is:

```ts
interface BrowserAdapter {
  launch(options: BrowserLaunchOptions): Promise<BrowserSession>
  close(session: BrowserSession): Promise<void>
}
```

`BrowserLaunchOptions` includes the normalized proxy, headless/runtime settings, and browser-specific options. `BrowserSession` exposes the common page/context operations needed by task code and, where applicable, a CDP endpoint or underlying process handle for cleanup.

Adapters:

- `ChromiumPlaywrightAdapter`: launches the default Chrome/Chromium Playwright browser with the normalized proxy.
- `CamoufoxAdapter`: launches Camoufox with the same normalized proxy contract and maps only Camoufox-specific options internally.
- `GpmLoginAdapter`: delegates profile operations to GPM Login, starts the selected profile, obtains its browser/CDP connection information, and returns a `BrowserSession` through the common interface.

### GPM Login settings and profile CRUD

GPM Login is configured through a dedicated settings flow:

1. The user enters the GPM Login API port.
2. The tool connects to that port.
3. On connection failure, it reports that GPM Login could not be connected, blocks profile CRUD, and allows retry or port correction.
4. On success, it loads the available groups.
5. The user selects exactly one group; multi-group selection is not allowed.
6. Profile CRUD operations are scoped to the selected group.
7. The selected group and validated port are used by later GPM browser launches.

The GPM client must keep connection testing, group listing, group selection, profile CRUD, profile start, and profile stop as separate operations. A failed group load must never be treated as an empty group list.

## Error handling

- Invalid proxy syntax: report source file and line number; do not launch a browser for that entry.
- Unsupported scheme or invalid port: report a validation error before launch.
- Kiot API failure: include HTTP status and Kiot code/message; do not launch with an unresolved key.
- GPM connection failure: show a clear connection error and keep the user in settings/retry flow.
- GPM group load failure: show a load error and prevent profile CRUD until a connection succeeds.
- Browser launch failure: identify the selected adapter and preserve the resolved proxy details for diagnosis.
- Cleanup failures are reported after the primary task result and must not hide the original failure.

## Testing requirements

Unit tests must cover:

- All four proxy syntaxes.
- Default `http://` insertion.
- Authenticated and unauthenticated proxies.
- Blank lines and line-numbered parse errors.
- Kiot response success, missing fields, and documented failure responses.
- Kiot release attempted during cleanup.
- GPM connection success/failure.
- Group loading success/failure.
- Exactly-one-group selection enforcement.
- CRUD calls scoped to the selected group.
- Browser adapter selection and common session contract.

Integration tests should use mocked/local browser and GPM endpoints where possible. Live Kiot/GPM verification must be opt-in and must not place real credentials in committed fixtures.

## Scope boundaries

This spec does not define task-specific website automation, CAPTCHA handling, proxy rotation policy beyond Kiot current/new/release calls, or a persistent credential vault. Those can be designed separately once the shared browser/proxy layer exists.

## Acceptance criteria

- Chromium Chrome via Playwright launches by default with a normalized direct proxy.
- The same task flow can select Camoufox or GPM Login without browser-specific task code.
- Every supported proxy line format parses deterministically.
- Kiot keys resolve to a usable proxy and are released during cleanup.
- GPM settings validates connectivity, loads groups, and permits exactly one selected group before profile CRUD.
- Failures are actionable and do not silently continue with missing proxy, group, or profile state.
