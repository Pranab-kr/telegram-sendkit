import "./env";
import { Hono, type Context } from "hono";
import { telegramMessageInputSchema, sendTelegramMessage } from "@pranabkr/sendkit-core";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { createClerkClient } from "@clerk/backend";
import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";

const clerkPubKey = process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (!clerkPubKey || !clerkSecretKey) throw new Error("Missing Clerk keys");

const clerkClient = createClerkClient({
  publishableKey: clerkPubKey,
  secretKey: clerkSecretKey,
});

function createServer(botToken: string) {
  const server = new McpServer({
    name: "sendkit-remote",
    version: "0.0.0",
  });

  server.registerTool(
    "telegram",
    {
      title: "Telegram",
      description: "Send messages to Telegram",
      inputSchema: telegramMessageInputSchema,
    },
    async (input) => {
      const result = await sendTelegramMessage({
        ...input,
        botToken: botToken,
      });

      return {
        content: [
          {
            type: "text",
            text: `Telegram message sent to chat ${result.chatId} with message ID ${result.messageId}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  return server;
}

// the handler builds a server per request, so the bot token has to be read back
// from the request URL that carries it (`/:botToken/mcp`)
function botTokenFromRequest(request: Request | undefined) {
  const botToken = request ? new URL(request.url).pathname.split("/")[1] : undefined;

  if (!botToken) throw new Error("Missing Telegram bot token in MCP endpoint URL");

  return botToken;
}

const mcpHandler = createMcpHandler(
  ({ requestInfo }) => createServer(botTokenFromRequest(requestInfo)),
  { responseMode: "json" },
);

const app = new Hono();

function protectedResourceMetadataUrl(c: Context, botToken: string) {
  return new URL(`/.well-known/oauth-protected-resource/${botToken}/mcp`, c.req.url).toString();
}

function unauthorizedMcpResponse(c: Context, botToken: string) {
  c.header(
    "WWW-Authenticate",
    `Bearer resource_metadata="${protectedResourceMetadataUrl(c, botToken)}"`,
  );

  return c.json({ error: "Unauthorized" }, 401);
}

app.get("/.well-known/oauth-protected-resource/:botToken/mcp", (c) => {
  return c.json(
    generateClerkProtectedResourceMetadata({
      publishableKey: clerkPubKey,
      resourceUrl: new URL(`/${c.req.param("botToken")}/mcp`, c.req.url).toString(),
    }),
  );
});

app.all("/:botToken/mcp", async (c) => {
  const botToken = c.req.param("botToken");

  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return unauthorizedMcpResponse(c, botToken);

  try {
    const requestState = await clerkClient.authenticateRequest(c.req.raw, {
      acceptsToken: "oauth_token",
    });

    if (!requestState.isAuthenticated) return unauthorizedMcpResponse(c, botToken);
  } catch {
    return unauthorizedMcpResponse(c, botToken);
  }

  return mcpHandler.fetch(c.req.raw);
});

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: (req: Request) => {
    // this will ensure the protocol stays on https and does not change into http
    const url = new URL(req.url);
    url.protocol = req.headers.get("x-forwarded-proto") ?? url.protocol;
    url.host = req.headers.get("x-forwarded-host") ?? url.host;

    return app.fetch(new Request(url, req));
  },
};
