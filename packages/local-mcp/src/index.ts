#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { sendTelegramMessage, telegramMessageInputSchema } from "@pranabkr/sendkit-core";

function getTelegramBOTToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN env var");

  return token;
}

serveStdio(() => {
  const server = new McpServer({
    name: "sendkit-local",
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
        botToken: getTelegramBOTToken(),
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
});
