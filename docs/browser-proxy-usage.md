# Browser and proxy setup

The application launches Chromium through Playwright by default. Camoufox and GPM Login are optional engines configured from **Settings → Browser**.

## Configure a browser

- **Chromium** is the default for new and migrated `config.json` files.
- **Camoufox** supports Default mode or Custom mode. Custom mode can enable GeoIP, Humanize, block WebRTC, block WebGL, and block images.
- **GPM Login** asks for its API port, connects immediately, then loads groups. Select exactly one group and enter the profile ID to launch from that group. A connection, group-load, or blank-profile error keeps the previous saved configuration and offers Retry or Back.

The selected group and profile ID are persisted in `config.json`. Choosing **Start** passes that saved profile ID to GPM Login; the shared runtime does not create, update, or delete profiles by itself.

## Configure proxy input

Select **Settings → Proxy**, then choose one of these modes:

- **None**: browser launches without a proxy.
- **Proxy Scheme**: select a `.txt` file of direct proxy lines.
- **Kiot Proxy**: select a `.txt` file of Kiot Proxy keys.

Blank lines are ignored. Each non-empty line is one input. Direct proxies use one of these formats:

```text
http:proxy.example:8080:user:password
https:proxy.example:443
proxy.example:8080:user:password
proxy.example:8080
```

The first token is treated as a scheme only when it is a supported scheme (`http`, `https`, `socks4`, `socks5`, or `socks5h`). A direct proxy without a scheme uses `http`. Invalid ports, incomplete credentials, malformed field counts, and blank proxy lines are rejected with the source line number.

A non-empty line without `:` is treated as a Kiot Proxy key. Before launch, the runtime resolves each key through Kiot's current-proxy endpoint. It releases each resolved key during cleanup. A Kiot API or response-validation failure prevents launch for that input.

## Runtime lifecycle

Choosing **Start** loads `config.json`, reads the configured proxy file, resolves every direct proxy or Kiot key, then launches the selected browser through the shared adapter interface. Browser sessions are closed in `finally`; partially created browser sessions and partially resolved Kiot key sets are also cleaned up. GPM stops a started profile after any later launch failure. Cleanup errors are reported without replacing the task's primary error.

## Verification status

`npm test` and `npm run build` are local diagnostics only. Real acceptance still requires captured evidence from the configured live services: GPM health/group responses, Kiot resolve/release responses, browser/CDP launch, navigation to an external-IP endpoint, and the observed external IP. Do not treat mock results as live compatibility evidence.
