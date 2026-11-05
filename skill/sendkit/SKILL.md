---
name: sendkit
description: Send Telegram messages from an agent using the sendkit toolset. Use whenever the user asks to send, push, notify, or deliver a Telegram message, mentions sendkit, wants to interact with the sendkit toolset, needs to choose between the sendkit MCP server and the sendkit CLI, or wants sendkit's setup verified manually. Prefer the sendkit MCP `telegram` tool, then the local `sendkit` CLI, and finally `npx @pranabkr/sendkit` when neither is available.
---

# SendKit

SendKit delivers a Telegram message through a single `telegram` capability that is exposed in two interchangeable ways: an **MCP tool** (for agents running with an MCP client) and a **CLI** (for shells, scripts, or environments without the MCP server wired up). Both call the same core and hit the same Telegram `sendMessage` API, so the only real decision is *which transport you have access to right now*.

## When to use this skill

Reach for sendkit as soon as the user wants a message to land on Telegram — even if they don't say "sendkit" or "Telegram bot" out loud. Common phrasings:

- "Send a Telegram message to chat 12345 saying the deploy finished."
- "Notify my team on Telegram when this build passes."
- "Use sendkit to ping me."
- "Is my sendkit MCP set up correctly?" / "Verify sendkit works."
- "Should I use the sendkit MCP or the CLI here?"

## Choosing a transport

Use the first available option in this order; don't ask the user unless multiple options are available and the choice matters.

- **Use the MCP `telegram` tool** when an MCP client is connected and the sendkit server is enabled. This is the default for agents — no token handling, no shell, just a tool call. The local server reads `TELEGRAM_BOT_TOKEN` from its environment; the remote server authenticates over OAuth and takes the bot token from the request path.
- **Use the local `sendkit` CLI** when no MCP server is available, when you're working from a terminal or script, or when the user explicitly wants the command-line path. The CLI stores its bot token in a config file, so it's self-contained once initialized.
- **Use `npx @pranabkr/sendkit`** when neither the local MCP nor the local CLI is installed or configured. This downloads and runs the published CLI without requiring a global install or repository checkout.

If the MCP is unavailable and the local CLI is missing, use the `npx` fallback below instead of stopping at a setup explanation.

## MCP workflow

Call the `telegram` tool with two string arguments, both required and non-empty:

- `chatId` — the Telegram chat identifier
- `message` — the text to send

A successful call returns a human-readable line like `Telegram message sent to chat <chatId> with message ID <messageId>` plus structured content `{ ok: true, chatId, messageId }`. Report the `messageId` back to the user so they can confirm delivery.

## CLI workflow

One-time setup — store the bot token in `~/.config/sendkit/config.json`:

```bash
sendkit init -t <TELEGRAM_BOT_TOKEN>
```

Then send:

```bash
sendkit telegram <chatId> "<message>"
```

It prints the result as JSON, e.g. `{"ok":true,"chatId":"12345","messageId":987}`. Quote the message so spaces and shell metacharacters survive intact. If `sendkit` isn't on the PATH, use `npx @pranabkr/sendkit ...` (or `bunx @pranabkr/sendkit ...`) instead of requiring a global install. If the package has not been initialized yet, run:

```bash
npx @pranabkr/sendkit init -t <TELEGRAM_BOT_TOKEN>
npx @pranabkr/sendkit telegram <chatId> "<message>"
```

For an already initialized CLI config, send directly:

```bash
npx @pranabkr/sendkit telegram <chatId> "<message>"
```

Use the repository source command only when working inside this checkout:
`bun run packages/cli/src/index.ts ...`.

## Setup and verification

When the user asks to verify sendkit, or a send fails with a token error, confirm the transport's prerequisites before assuming a code problem:

- **MCP (local):** `TELEGRAM_BOT_TOKEN` must be present in the server's environment. In this repo the root `opencode.json` registers the `sendkit` local MCP server and supplies that env var. Missing token → `Missing TELEGRAM_BOT_TOKEN env var`.
- **MCP (remote):** the server must be deployed and reachable, with Clerk OAuth keys set. See the remote app's `.well-known` metadata for the authorization server.
- **CLI:** the config file must exist and contain a token. `sendkit init -t <token>` creates it. Missing file/token → `Missing config file. Please run sendkit init ...`.
- **npx CLI fallback:** if no local CLI exists, initialize and invoke the published package with `npx @pranabkr/sendkit init -t <token>` and `npx @pranabkr/sendkit telegram <chatId> "<message>"`.

A lightweight manual check that isolates sendkit from Telegram itself is to call the API directly with the same token and chat, so you can see Telegram's raw response:

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"<chatId>","text":"sendkit manual test"}'
```

`"ok":true` here means the token and chat are valid; if this works but sendkit doesn't, the problem is in sendkit's configuration, not Telegram.

## Reporting results

Tell the user, in one line, where the message went and the Telegram `messageId`. On failure, surface the error message verbatim (it already names the missing config or the Telegram `description`) and point to the matching fix above rather than retrying blindly.
