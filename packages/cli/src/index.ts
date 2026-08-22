import { Command } from "commander";
import { sendTelegramMessage } from "sendkit-core";

const program = new Command();

program
	.name("sendkit")
	.description("Sendkit CLI")
	.command("telegram")
	.description("send a Telegram message")
	.argument("<chatId>", "Telegram chat ID")
	.argument("message", "Message text to send")
	.action(async (chatId: string, message: string) => {
		const token = process.env.TELEGRAM_BOT_TOKEN;

		// for cli validtion
		if (!token) {
			console.error("Missing TELEGRAM_BOT_TOKEN env var");
			process.exit(1);
		}

		if (!chatId) {
			console.error("Missing Telegram chat ID");
			process.exit(1);
		}

		if (!message) {
			console.error("Missing Telegram message text");
			process.exit(1);
		}

		try {
			const result = await sendTelegramMessage({
				botToken: token,
				chatId,
				message,
			});

			console.log(`Send telegram message to chat ${result.chatId} `);

			console.log(`Telegram message ID: ${result.messageId}`);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			console.log(`Telegram API req failed: ${detail}`);
			process.exit(1);
		}
	});

program.parseAsync(process.argv);
