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

## GPM v1 contract correction and live verification

The original client used undocumented `/api/v3` endpoints. It was corrected to the local `docs/gpm.md` v1 contract:

- `GET /api/v1` for connection verification;
- `GET /api/v1/groups?page=1&page_size=100`, unwrapping its pagination `data` array;
- documented v1 profile create/update/delete/start/stop endpoints;
- `websocket_debugging_url` as the CDP endpoint field; and
- group selection is enforced for every profile operation, including start/stop.

```text
node --import tsx --test src/services/gpmlogin.test.ts
Exit 0: 5 passing, 0 failing.

npm test
Exit 0: 33 passing, 0 failing.

npm run build
Exit 0: tsc completed successfully.

Live GPM Login v1, localhost:9495
GET /api/v1: reachable.
GET /api/v1/groups?page=1&page_size=100: 9 groups; configured CanvaLeonardo group matched.
Temporary profile: created, start returned websocket_debugging_url, stop succeeded, then soft-delete succeeded.

Live GPM adapter browser capture, temporary profile
GET https://api.ipify.org?format=json
Adapter: gpm
HTTP status: 200
Observed external IP: 115.76.49.110
CDP endpoint: received by adapter.
Browser close/profile stop: completed.
Temporary profile: soft-deleted.
```

The temporary profiles used for the live checks were soft-deleted. The GPM profile used no configured proxy, so its observed IP confirms browser navigation through the GPM CDP adapter but not proxy routing through GPM. Kiot resolve/release was not called with a live key in this correction.

## GPM proxy routing capture

Both checks created a temporary profile in the supplied GPM group with `raw_proxy`, started it with the documented `skip_proxy_check=true` option, attached through the returned CDP websocket, and then stopped and soft-deleted it.

```text
HTTP proxy profile
raw_proxy: http://42.117.52.59:27472
Normal GPM start: ProxyCheckFailed.
Start with skip_proxy_check=true: browser launched, but navigation returned
net::ERR_NO_SUPPORTED_PROXIES.
Result: HTTP proxy routing through GPM is not verified; the browser rejected it.

SOCKS5 proxy profile
raw_proxy: socks5://42.117.52.59:65104
GET https://api.ipify.org?format=json through the GPM CDP browser
HTTP status: 200
Expected proxy IP: 42.117.52.59
Observed external IP: 42.117.52.59
Result: proxy routing through GPM verified.
Profile stop: completed.
Temporary profile: soft-deleted.
```

### HTTP follow-up diagnosis

The initial HTTP check used `http://ip:port`, then `ip:port` was tested as the documented alternate format. GPM persisted the latter unchanged, confirming it accepted the HTTP proxy value, but its normal preflight returned `ProxyCheckFailed`; a browser started with `skip_proxy_check=true` timed out on the IP-check request.

The same HTTP proxy was then tested immediately with Playwright Chromium directly (outside GPM) and timed out on the same request. Therefore the captured evidence does not support an assertion that GPM lacks HTTP support: the supplied HTTP proxy endpoint was not forwarding traffic at the time of the control test. SOCKS5 routing remains the only verified GPM proxy route.

## Scope and concerns

- The active menu now invokes the runtime, but it has no task-specific browser automation; the common runtime accepts a task callback for future automation.
- GPM runtime launch still requires a profile ID supplied by that future task flow; Task 5 persists and validates only the required port/group settings.
- Existing `dist/` changes and prior task review files remain unstaged and untouched.
