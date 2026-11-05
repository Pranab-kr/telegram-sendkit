import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import { sendTelegramMessage, telegramMessageInputSchema } from "sendkit-core";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";

const mcpServer = new McpServer({
    name: "sendkit-local",
    version: "0.0.0",
});

function getTelegramBOTToken() {
    const token  = process.env.TELEGRAM_BOT_TOKEN;

    if(!token)
        throw new Error("Missing TELEGRAM_BOT_TOKEN env var");

    return token;
}

mcpServer.registerTool(
    "telegram",
    {
        title: "Telegram",
        description: "Send messages to Telegram",
        inputSchema: telegramMessageInputSchema.shape,
    },
    async (input) => {
        const result = await sendTelegramMessage({
            ...input,
            botToken: getTelegramBOTToken(),
        })

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
)

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
