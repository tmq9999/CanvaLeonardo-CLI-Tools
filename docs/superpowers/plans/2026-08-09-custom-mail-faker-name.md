# Custom Mail Faker Full Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit Canva Custom Mail invites to generate an English full name when `--name` is omitted.

**Architecture:** The CLI parser permits generated email and name only when called with explicit Custom Mail options. A small identity resolver combines the Custom Mail Faker mailbox with either a supplied name or `faker.person.fullName()`, before any browser is launched.

**Tech Stack:** TypeScript, `@faker-js/faker`, Node test runner, existing Canva invite CLI.

## Global Constraints

- Generate a name only when `serviceMail === "custom"` and `--name` is absent.
- Preserve the existing requirement that non-Custom Mail invites provide both `--email` and `--name`.
- Reuse the installed `@faker-js/faker`; do not add a locale setting.
- Do not print credentials, OTPs, TOTP secrets, recovery codes, or Cloudflare tokens.
- Do not launch a browser or create a Canva account solely to test this change.

---

### Task 1: Parse and resolve an optional Custom Mail name

**Files:**
- Modify: `src/cli/canva-invite-login.ts`
- Modify: `src/cli/canva-invite-login.test.ts`

**Interfaces:**
- Produces `parseCanvaInviteLoginArgs(args, options)` where `options` has `allowGeneratedEmail` and `allowGeneratedName` booleans.
- Produces `resolveCanvaInviteIdentity(args, config, fullName)` returning `{ email: string, name: string }`.

- [ ] **Step 1: Add failing parser and resolver tests**

```ts
test("Custom Mail invite does not require --email or --name", () => {
    assert.deepEqual(parseCanvaInviteLoginArgs([
        "--invite", invite
    ], { allowGeneratedEmail: true, allowGeneratedName: true }), {
        inviteUrl: invite, email: undefined, name: undefined
    })
})

test("Custom Mail resolves a Faker full name when --name is absent", () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.general.serviceMail = "custom"
    config.general.customMail.domains = ["example.test"]
    const identity = resolveCanvaInviteIdentity({ inviteUrl: invite }, config, () => "Jordan Taylor")
    assert.equal(identity.name, "Jordan Taylor")
    assert.match(identity.email, /@example\.test$/)
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --import tsx --test src/cli/canva-invite-login.test.ts`

Expected: FAIL because the parser requires `--name` and no identity resolver exists.

- [ ] **Step 3: Implement the minimal parser options and identity resolver**

```ts
export type CanvaInviteLoginArgs = { inviteUrl: string; email?: string; name?: string }
export type CanvaInviteArgumentOptions = { allowGeneratedEmail?: boolean; allowGeneratedName?: boolean }

export function resolveCanvaInviteIdentity(
    args: CanvaInviteLoginArgs,
    config: AppConfig,
    fullName = () => faker.person.fullName()
): { email: string; name: string } {
    const email = config.general.serviceMail === "custom" ? createCustomMailbox(config.general.customMail) : args.email
    const name = config.general.serviceMail === "custom" ? args.name ?? fullName() : args.name
    if (!email) throw new Error("Thiếu --email khi Service Mail không phải Custom Mail")
    if (!name) throw new Error("Thiếu --name khi Service Mail không phải Custom Mail")
    return { email, name }
}
```

Update `runCanvaInviteLogin` to use the resolver once and pass its `name` to `joinCanvaInvite`. The CLI entry point passes both parser allow flags only when the loaded service is Custom Mail.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --import tsx --test src/cli/canva-invite-login.test.ts`

Expected: PASS, including Custom Mail without either generated field and non-Custom validation.

- [ ] **Step 5: Commit only the task files**

```bash
git add src/cli/canva-invite-login.ts src/cli/canva-invite-login.test.ts
git commit --only -m "feat: generate Custom Mail invite names" -- src/cli/canva-invite-login.ts src/cli/canva-invite-login.test.ts
```

### Task 2: Full regression verification

**Files:**
- No source changes expected.

**Interfaces:**
- Verifies parser, identity resolver, mailbox generation, and TypeScript compilation together.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: zero test failures.

- [ ] **Step 2: Run the TypeScript build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 3: Run a no-browser Custom Mail smoke check**

Run:

```bash
npx tsx -e "import { loadConfig } from './src/core/config.ts'; import { parseCanvaInviteLoginArgs, resolveCanvaInviteIdentity } from './src/cli/canva-invite-login.ts'; (async () => { const config = await loadConfig(); const args = parseCanvaInviteLoginArgs(['--invite', 'https://www.canva.com/brand/join?token=smoke'], { allowGeneratedEmail: true, allowGeneratedName: true }); const identity = resolveCanvaInviteIdentity(args, config, () => 'Jordan Taylor'); console.log(JSON.stringify({ hasEmail: identity.email.includes('@'), generatedName: identity.name === 'Jordan Taylor' })); })();"
```

The check loads the saved config, parses only `--invite`, resolves a deterministic injected Faker name, and prints boolean assertions only.

- [ ] **Step 4: Verify the task commit is scoped**

Run: `git show --stat --oneline HEAD`

Expected: only `canva-invite-login.ts` and its focused test are in the task commit.
