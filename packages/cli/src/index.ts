import { Command } from "commander";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { sendTelegramMessage } from "sendkit-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

const program = new Command();
const configPath = join(homedir(), ".config", "sendkit", "config.json");

const cliConfigSchema = z.object({
	telegramBotToken: z.string().optional(),
});

function writeTelegramBotToken(token: string) {
	mkdirSync(dirname(configPath), { recursive: true });

	writeFileSync(configPath, JSON.stringify({ telegramBotToken: token }, null, 2), {
		mode: 0o600,
	});
}

function getTelegramBotToken() {
	if (!existsSync(configPath)) {
		throw new Error(
			"Missing config file. Please run `sendkit init` to set the Telegram bot token.",
		);
	}
	const config = cliConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf-8")));
	const token = config.telegramBotToken;

	if (!token) {
		throw new Error(
			"Missing Telegram bot token in config file. Please run `sendkit init` to set the Telegram bot token.",
		);
	}

	return token;
}

program.name("sendkit").description("Sendkit CLI backed by sendkit-core");

program
	.command("init")
	.description("Configure the sendkit CLI with your Telegram bot token")
	.requiredOption("-t, --telegram-bot-token <botToken>", "Telegram bot token")
	.action(async (options: { telegramBotToken: string }) => {
		writeTelegramBotToken(options.telegramBotToken);
		console.log(`Saved Sendkit cli config to ${configPath}.`);
	});

program
	.command("telegram")
	.description("send a Telegram message")
	.argument("<chatId>", "Telegram chat ID")
	.argument("message", "Message text to send")
	.action(async (chatId: string, message: string) => {
		const result = await sendTelegramMessage({
			botToken: getTelegramBotToken(),
			chatId,
			message,
		});

		console.log(JSON.stringify(result));
	});

await program.parseAsync(process.argv).catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
