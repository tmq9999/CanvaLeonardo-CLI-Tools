Title: API Documentation – GPMLogin

URL Source: <https://api-docs.gpmloginapp.com/>

Markdown Content:
<http://localhost:9495/api/v1>

## What is the Local API?

GPMLogin runs a **local HTTP server** on your machine to control the app programmatically: create/start/stop profiles, manage groups, proxies, extensions. It only serves requests from the same machine (`localhost` / `127.0.0.1`) and is not exposed to the Internet, so **no API key / token is required**.

## Base URL & port

By default the server listens on port **9495**. If that port is taken, GPMLogin picks a random port in **8000–10000** and writes the active port to a `http.port` file inside the app's local data folder. Read the actual port from there if needed.

## Common response envelope

Every response is JSON in the shape below. `success` indicates success/failure; `data` holds the payload (object/array/null); `message` is a status message (usually `"OK"` or an error); `sender` is the running GPMLogin name & version.

## Pagination (list endpoints)

All "find all" endpoints return `data` as a pagination object. Shared query params: `page` (default 1), `page_size` (default 30), `search` (keyword), `sort` (integer — see table).

| sort | Meaning |
| --- | --- |
| 0 | Newest first (default) |
| 1 | Oldest first |
| 2 | Name A → Z |
| 3 | Name Z → A |

## Enum values (number or string)

Enum fields (e.g. `browser_type`, `os_type`, `canvas_mode`…) accept **either an integer or a string name**. This doc lists both. For example `"browser_type": 1` equals `"browser_type": "chrome"` (case-insensitive).

Create, update, delete, start/stop browsers and list profiles.

GET`/api/v1/profiles`

### List profiles

Returns a paginated list of profiles.

The list does **not** include `fingerprint` (kept light). Fetch a single profile to see the full fingerprint.

#### Query parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| page | int | No | 1 | Current page. |
| page_size | int | No | 30 | Items per page. |
| search | string | No | — | Search keyword by profile name. |
| sort | int | No | 0 | Sort order (0–3, see Overview). |

#### Sample response

GET`/api/v1/profiles/{id}`

### Get one profile

Returns a single profile including its fingerprint data.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | Profile ID. |

#### Sample response

POST`/api/v1/profiles/create`

### Create profile

Create a new profile. Only `name` is required; any other field omitted/null uses defaults and the fingerprint is auto-randomized.

#### Request body

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| name | string | Yes | — | Profile name. **Required**. |
| group_id | string | No | — | Group ID for the profile. Omit / null = use default setting. |
| raw_proxy | string | No | — | Proxy string (e.g. `socks5://ip:port`). Empty = no proxy. Omit / null = use default setting. |
| bypass_proxy_extensions | string | No | — | Domains that bypass the proxy. Omit / null = use default setting. |
| browser_type | enum | No | chrome (1) | Browser type: `1`=chrome, `2`=firefox, `3`=edge, `4`=opera, `5`=brave. |
| browser_version | string | No | newest | Browser version (see `/browsers/versions`). |
| os_type | enum | No | current OS | OS: `1`=Windows, `2`=macOS Intel, `3`=macOS ARM, `4`=Linux, `5`=Android. |
| custom_user_agent | string | No | — | Custom User-Agent. Setting it enables manual UA override. Omit / null = use default setting. |
| task_bar_title | string | No | — | Window title shown on the taskbar. Omit / null = use default setting. |
| webrtc_mode | enum | No | — | WebRTC: `1`=Based on IP, `2`=Fixed, `3`=Real, `4`=Disabled. Omit / null = use default setting. |
| fixed_webrtc_public_ip | string | No | — | Fixed public IP for WebRTC. Required when `webrtc_mode = 2`. |
| port_protect | string | No | — | Protected ports (port-scan protection). Omit / null = use default setting. |
| geolocation_mode | enum | No | — | Geolocation: `1`=Allow, `2`=Prompt, `3`=Block. Omit / null = use default setting. |
| canvas_mode | enum | No | — | Canvas: `1`=Noise, `2`=Real, `3`=Block. Omit / null = use default setting. |
| client_rect_mode | enum | No | — | ClientRect: `1`=Noise, `2`=Real. Omit / null = use default setting. |
| webgl_image_mode | enum | No | — | WebGL Image: `1`=Noise, `2`=Real. Omit / null = use default setting. |
| webgl_metadata_mode | enum | No | — | WebGL Metadata: `1`=Masked, `2`=Real. Omit / null = use default setting. |
| audio_mode | enum | No | — | Audio: `1`=Noise, `2`=Real. Omit / null = use default setting. |
| is_masked_media | bool | No | false | `true` = mask media devices (camera/mic/speaker). |
| font_mode | enum | No | — | Font: `1`=Masked, `2`=Real. Omit / null = use default setting. |
| timezone_base_on_ip | bool | No | true | `true` = timezone auto-follows the proxy IP. |
| timezone | string | No | — | Fixed timezone (e.g. `Asia/Ho_Chi_Minh`). Set when `timezone_base_on_ip = false`. |
| is_language_base_on_ip | bool | No | true | `true` = language auto-follows the proxy IP. |
| fixed_language | string | No | — | Fixed language (e.g. `vi`, `en`, `zh`). Set when `is_language_base_on_ip = false`. |
| startup_urls | string | No | — | URLs to open on startup (multiple separated by newlines). |
| note | string | No | — | Profile note. Omit / null = use default setting. |

#### Request body

#### Sample response

POST`/api/v1/profiles/update/{id}`

### Update profile

Partially update a profile. Omitted/null fields **keep** their current value (no reset). Same field set as create.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | ID of the profile to update. |

#### Request body

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| name | string | No | — | Profile name. |
| group_id | string | No | — | Group ID for the profile. Omit / null = leave the current value unchanged. |
| raw_proxy | string | No | — | Proxy string (e.g. `socks5://ip:port`). Empty = no proxy. Omit / null = leave the current value unchanged. |
| bypass_proxy_extensions | string | No | — | Domains that bypass the proxy. Omit / null = leave the current value unchanged. |
| browser_type | enum | No | chrome (1) | Browser type: `1`=chrome, `2`=firefox, `3`=edge, `4`=opera, `5`=brave. |
| browser_version | string | No | newest | Browser version (see `/browsers/versions`). |
| os_type | enum | No | current OS | OS: `1`=Windows, `2`=macOS Intel, `3`=macOS ARM, `4`=Linux, `5`=Android. |
| custom_user_agent | string | No | — | Custom User-Agent. Setting it enables manual UA override. Omit / null = leave the current value unchanged. |
| task_bar_title | string | No | — | Window title shown on the taskbar. Omit / null = leave the current value unchanged. |
| webrtc_mode | enum | No | — | WebRTC: `1`=Based on IP, `2`=Fixed, `3`=Real, `4`=Disabled. Omit / null = leave the current value unchanged. |
| fixed_webrtc_public_ip | string | No | — | Fixed public IP for WebRTC. Required when `webrtc_mode = 2`. |
| port_protect | string | No | — | Protected ports (port-scan protection). Omit / null = leave the current value unchanged. |
| geolocation_mode | enum | No | — | Geolocation: `1`=Allow, `2`=Prompt, `3`=Block. Omit / null = leave the current value unchanged. |
| canvas_mode | enum | No | — | Canvas: `1`=Noise, `2`=Real, `3`=Block. Omit / null = leave the current value unchanged. |
| client_rect_mode | enum | No | — | ClientRect: `1`=Noise, `2`=Real. Omit / null = leave the current value unchanged. |
| webgl_image_mode | enum | No | — | WebGL Image: `1`=Noise, `2`=Real. Omit / null = leave the current value unchanged. |
| webgl_metadata_mode | enum | No | — | WebGL Metadata: `1`=Masked, `2`=Real. Omit / null = leave the current value unchanged. |
| audio_mode | enum | No | — | Audio: `1`=Noise, `2`=Real. Omit / null = leave the current value unchanged. |
| is_masked_media | bool | No | false | `true` = mask media devices (camera/mic/speaker). |
| font_mode | enum | No | — | Font: `1`=Masked, `2`=Real. Omit / null = leave the current value unchanged. |
| timezone_base_on_ip | bool | No | true | `true` = timezone auto-follows the proxy IP. |
| timezone | string | No | — | Fixed timezone (e.g. `Asia/Ho_Chi_Minh`). Set when `timezone_base_on_ip = false`. |
| is_language_base_on_ip | bool | No | true | `true` = language auto-follows the proxy IP. |
| fixed_language | string | No | — | Fixed language (e.g. `vi`, `en`, `zh`). Set when `is_language_base_on_ip = false`. |
| startup_urls | string | No | — | URLs to open on startup (multiple separated by newlines). |
| note | string | No | — | Profile note. Omit / null = leave the current value unchanged. |

#### Request body

#### Sample response

GET`/api/v1/profiles/delete/{id}`

### Delete profile

Delete a profile. `mode=soft` moves it to trash (recoverable), `mode=hard` permanently deletes it and its on-disk data.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | Profile ID. |

#### Query parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| mode | string | No | soft | `soft` (to trash) or `hard` (permanent). |

#### Sample response

GET`/api/v1/profiles/start/{id}`

### Start browser

Launch the profile's browser and return info to drive it via Selenium/Puppeteer/Playwright (remote debugging port and websocket URL).

Use `websocket_debugging_url` to attach Puppeteer/Playwright, or `remote_debugging_port` for Selenium (`debuggerAddress`).

If the profile is already running, the API returns the cached result (no relaunch).

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | ID of the profile to start. |

#### Query parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| remote_debugging_port | int | No | random free port | Set the remote debugging port. Omit = auto pick a free port. |
| window_scale | double | No | 1 | Window zoom scale, e.g. `0.8`. |
| window_pos | string | No | — | Window position `x,y`, e.g. `100,100`. |
| window_size | string | No | — | Window size `width,height`, e.g. `800,600`. |
| skip_proxy_check | bool | No | false | `true` = skip the proxy check before launching (faster). |
| addition_args | string | No | — | Extra Chromium command-line args, e.g. `--mute-audio`. |

#### Sample response

GET`/api/v1/profiles/stop/{id}`

### Stop browser

Close the profile's running browser.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | ID of the profile to stop. |

#### Sample response

GET`/api/v1/browsers/versions`

### List browser versions

Returns supported Chromium and Firefox versions — useful to fill `browser_version` when creating a profile.

#### Sample response

Groups to categorize profiles.

GET`/api/v1/groups`

### List groups

Returns a paginated list of groups.

#### Query parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| page | int | No | 1 | Current page. |
| page_size | int | No | 30 | Items per page. |
| search | string | No | — | Search by group name. |
| sort | int | No | 0 | Sort order (0–3). |

#### Sample response

GET`/api/v1/groups/{id}`

### Get one group

Returns a single group by ID.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | Group ID. |

#### Sample response

POST`/api/v1/groups/create`

### Create group

Create a new group.

⚠️ The old Postman used the key `order` — the current build uses `sort_order`.

#### Request body

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| name | string | Yes | — | Group name. |
| sort_order | int | No | 0 | Display order (smaller = higher). |

#### Request body

#### Sample response

POST`/api/v1/groups/update/{id}`

### Update group

Rename / reorder a group. `sort_order` is only applied when > 0.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | Group ID. |

#### Request body

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| name | string | Yes | — | New group name. |
| sort_order | int | No | — | New order (applied only when > 0). |

#### Request body

#### Sample response

GET`/api/v1/groups/delete/{id}`

### Delete group

Delete a group by ID.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | Group ID. |

#### Sample response

Shared proxy store.

GET`/api/v1/proxies`

### List proxies

Returns a paginated list of proxies.

#### Query parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| page | int | No | 1 | Current page. |
| page_size | int | No | 30 | Items per page. |
| search | string | No | — | Search by proxy string. |
| sort | int | No | 0 | Sort order (0–3). |

#### Sample response

GET`/api/v1/proxies/{id}`

### Get one proxy

Returns a single proxy by ID.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | Proxy ID. |

#### Sample response

POST`/api/v1/proxies/create`

### Create proxy

Add a new proxy to the store.

#### Request body

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| raw_proxy | string | Yes | — | Proxy string. Supports `ip:port`, `ip:port:user:pass`, or with a scheme `http://`, `socks5://`. |

#### Request body

#### Sample response

POST`/api/v1/proxies/update/{id}`

### Update proxy

Change the proxy string of a record.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | Proxy ID. |

#### Request body

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| raw_proxy | string | Yes | — | New proxy string. |

#### Request body

#### Sample response

GET`/api/v1/proxies/delete/{id}`

### Delete proxy

Delete a proxy by ID.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | Proxy ID. |

#### Sample response

Manage browser extensions.

GET`/api/v1/extensions`

### List extensions

Returns all installed extensions (array, not paginated).

#### Sample response

GET`/api/v1/extensions/update-state/{id}`

### Set extension state

Enable/disable an extension, optionally scoped to specific groups.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | | Extension ID. |

#### Query parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| active | bool | Yes | — | `true` = enable, `false` = disable. |
| applied_group_ids | string | No | — | Comma-separated group IDs to scope the change to those groups, e.g. `id1,id2`. Omit = apply globally. |

#### Sample response
