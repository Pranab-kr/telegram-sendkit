# SendKit

SendKit is a small Telegram messaging toolkit for agents and scripts. It exposes one capability — sending a text message to a Telegram chat — through three interchangeable front doors: a **CLI**, a **local MCP server**, and a **hosted remote MCP server** with OAuth. All three call the same core, so results and error messages stay identical no matter how you reach them.

## What it does

A single operation wraps the Telegram Bot API `sendMessage` endpoint:

```ts
sendTelegramMessage({ botToken, chatId, message });
// => { ok: true, chatId: "12345", messageId: 987 }
```

Inputs and outputs are validated with Zod at every layer, so bad arguments fail before a request leaves the process and Telegram's response is parsed into a typed result.

## Repository layout

Bun workspace, split into a shared core and the surfaces that consume it.

| Path                 | Package                  | Role                                                                        |
| -------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `packages/core`      | `@pranabkr/sendkit-core` | Telegram send operation plus all Zod schemas. No transport concerns.        |
| `packages/cli`       | `@pranabkr/sendkit`      | `sendkit` command-line interface (commander).                               |
| `packages/local-mcp` | `@pranabkr/sendkit-mcp`  | Local MCP server over stdio, publishing the `telegram` tool.                |
| `apps/remote-mcp`    | `sendkit-remote-mcp`     | Deployable HTTP MCP server (Hono) with Clerk OAuth. Private, not published. |
| `skill/sendkit`      | —                        | Agent skill describing when to pick MCP vs. CLI.                            |

TypeScript is configured once at the repo root (`tsconfig.json`) and governs every package through upward lookup, so compiler options are edited there rather than per package. Each publishable package has its own `tsdown.config.ts` for the actual build.

## Requirements

- [Bun](https://bun.sh) for installing, running, and building
- Node 20+ for the built output (`target: node20`)
- A Telegram bot token from [@BotFather](https://t.me/BotFather), and the numeric chat ID you want to write to

## Getting started

```bash
git clone https://github.com/Pranab-kr/telegram-sendkit.git
cd telegram-sendkit
bun install
cp .env.example .env
```

Then fill in `.env`. The whole file is gitignored, and `.env.example` documents the expected keys:

| Variable                | Used by    | Purpose                                                                    |
| ----------------------- | ---------- | -------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`    | local MCP  | Bot token for the stdio server.                                            |
| `CLERK_PUBLISHABLE_KEY` | remote MCP | Clerk OAuth — required, or the server throws `Missing Clerk keys` at boot. |
| `CLERK_SECRET_KEY`      | remote MCP | Clerk OAuth — required, same check as above.                               |
| `PORT`                  | remote MCP | Listen port, defaults to `3000`.                                           |

The remote MCP app locates this `.env` by walking up from its own module directory, so it starts correctly regardless of the current working directory. Values already present in the real environment win; the file only fills gaps.

## Usage

### CLI

The CLI keeps its own token in `~/.config/sendkit/config.json`, written with `0o600` permissions, so it works from any project without exporting env vars.

```bash
sendkit init -t <TELEGRAM_BOT_TOKEN>
sendkit telegram <chatId> "<message>"
```

The send prints JSON:

```json
{ "ok": true, "chatId": "12345", "messageId": 987 }
```

Quote the message so spaces and shell metacharacters survive. Without a global install, run the published package directly with `npx @pranabkr/sendkit ...` or `bunx @pranabkr/sendkit ...`. Inside a checkout, use `bun run packages/cli/src/index.ts ...`.

### Local MCP

A stdio server exposing one tool, `telegram`, with two required non-empty string arguments: `chatId` and `message`. It reads `TELEGRAM_BOT_TOKEN` from its environment and fails with `Missing TELEGRAM_BOT_TOKEN env var` if absent.

Register it with any MCP client:

```json
{
  "mcpServers": {
    "sendkit": {
      "command": "bunx",
      "args": ["-y", "@pranabkr/sendkit-mcp"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "<token>"
      }
    }
  }
}
```

A successful call returns readable text — `Telegram message sent to chat <chatId> with message ID <messageId>` — alongside structured content `{ ok, chatId, messageId }`.

For OpenCode, an equivalent local entry goes in `opencode.json`. That file is gitignored here, which matters: keep the bot token out of anything tracked.

### Remote MCP

An HTTP server using the streamable transport, intended for deployment where clients authorize through Clerk rather than holding a token locally.

Routes:

- `POST /:botToken/mcp` — the MCP endpoint. Requires an `Authorization: Bearer <token>` header and a Clerk-authenticated request; otherwise returns `401` with a `WWW-Authenticate` header pointing at the protected-resource metadata. Note that the bot token travels in the URL path, so this is only appropriate when you control both ends.
- `GET /.well-known/oauth-protected-resource/:botToken/mcp` — Clerk protected-resource metadata used for OAuth discovery.

Run locally:

```bash
bun run dev:remote-mcp
```

## Agent skill

`skill/sendkit/SKILL.md` is an installable agent skill that triggers on requests like "notify my team on Telegram when the build passes," even when neither SendKit nor Telegram is named explicitly. It encodes the preference order — MCP tool, then local CLI, then the `npx` fallback — along with setup verification steps, so agents pick a transport instead of asking.

## Development

| Command                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `bun run dev:cli`        | Run the CLI from source.                                 |
| `bun run dev:local-mcp`  | Run the local MCP server from source.                    |
| `bun run dev:remote-mcp` | Run the remote MCP server from source.                   |
| `bun run format`         | Format the repo with oxfmt (`--write`).                  |
| `bun run format:check`   | Formatting check only.                                   |
| `bun run lint`           | oxlint with `--deny-warnings`, so warnings fail the run. |
| `bun run lint:fix`       | Autofix.                                                 |
| `bun run typecheck`      | `tsc --noEmit` across the workspace.                     |

Builds and release previews, per package:

```bash
bun run build:core
bun run build:cli
bun run build:local-mcp

bun run release:pack:core      # build + `bun pm pack --dry-run`
bun run release:pack:cli
bun run release:pack:local-mcp
```

`prepublishOnly` runs the build automatically, so publishing cannot ship stale `dist/`. Published packages are scoped under `@pranabkr` with public access and emit ESM with type declarations and sourcemaps.

## Troubleshooting

Errors come from the core verbatim, which usually identifies the missing piece:

| Symptom                                                          | Cause and fix                                                                           |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Missing TELEGRAM_BOT_TOKEN env var`                             | Local MCP started without the env var. Set it in the client's `env` block or the shell. |
| `Missing config file. Please run sendkit init ...`               | CLI used before initialization. Run `sendkit init -t <token>`.                          |
| `Missing Telegram bot token in config file`                      | Config exists but the `telegramBotToken` key is empty. Re-run `sendkit init`.           |
| `Missing Clerk keys`                                             | Remote MCP without both `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.                 |
| Telegram's own `description` (e.g. unauthorized, chat not found) | The token or chat ID is wrong at Telegram's end, not a SendKit problem.                 |

To isolate SendKit from Telegram, call the API directly with the same token and chat and inspect the raw response:

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"<chatId>","text":"sendkit manual test"}'
```

`"ok":true` here means the token and chat are valid — if that works but SendKit does not, the configuration is at fault.

## Security notes

- Never commit bot tokens. `.env`, `opencode.json`, and `.mcp.json` are gitignored for this reason; prefer `${TELEGRAM_BOT_TOKEN}`-style references or client-supplied env blocks over literals in tracked config.
- The remote MCP endpoint puts the bot token in the URL path, which leaks it into access logs and proxy history. Treat that as acceptable only behind infrastructure you control.
- A token that reaches a git history should be considered compromised — revoke and reissue it via [@BotFather](https://t.me/BotFather) rather than scrubbing commits.

## License

Not yet specified.
