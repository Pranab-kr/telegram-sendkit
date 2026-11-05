import "./env.ts";
import { Hono, type Context } from "hono";
import { telegramMessageInputSchema, sendTelegramMessage } from "@pranabkr/sendkit-core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
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
      inputSchema: telegramMessageInputSchema.shape,
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

app.post("/:botToken/mcp", async (c) => {
  const botToken = c.req.param().botToken;

  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return unauthorizedMcpResponse(c, botToken);

  const server = createServer(botToken);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    const requestState = await clerkClient.authenticateRequest(c.req.raw, {
      acceptsToken: "oauth_token",
    });

    if (!requestState.isAuthenticated) return unauthorizedMcpResponse(c, botToken);
  } catch {
    return unauthorizedMcpResponse(c, botToken);
  }

  await server.connect(transport);

  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    await transport.close();
  }
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
