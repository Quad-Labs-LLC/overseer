/**
 * Discord Bot Runner (Multi-Instance, Per-User)
 *
 * Loads all active `interfaces` rows of type "discord" and starts one discord.js
 * client per row. Each interface row belongs to a web user (owner_user_id), and
 * all executions run inside that tenant's sandbox root: data/userfs/web/<owner>.
 *
 * Note: This is a pragmatic implementation (DMs + !ask). It intentionally avoids
 * global slash-command registration to keep multi-instance behavior reliable.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  type Message,
  type ChatInputCommandInteraction,
} from "discord.js";
import { config } from "dotenv";
import { resolve } from "path";

import { interfacesModel, usersModel } from "../database/index";
import { initializeSchema } from "../database/db";
import { createBotLogger, isRateLimited, splitText } from "./shared";
import { recordChannelEvent } from "../lib/channel-observability";
import { streamGatewayChat } from "../gateway/sse-client";

config({ path: resolve(process.cwd(), ".env") });
initializeSchema();

const COOLDOWN_MS = 2000;
const MAX_MESSAGE_LEN = 1900;
const DISCORD_COMMANDS = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask Overseer something")
    .addStringOption((option) =>
      option
        .setName("prompt")
        .setDescription("What you want Overseer to do")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show Discord bot usage help"),
].map((command) => command.toJSON());

function getGatewayBaseUrl(): string {
  const port = process.env.PORT || "3000";
  return process.env.GATEWAY_BASE_URL || process.env.BASE_URL || `http://localhost:${port}`;
}

function getFallbackOwnerUserId(): number {
  const admin = usersModel.findAll().find((u) => u.role === "admin");
  return admin?.id ?? usersModel.findAll()[0]?.id ?? 1;
}

function getActiveDiscordInterfaces(): Array<{
  id: number;
  owner_user_id: number;
  name: string;
  config: Record<string, unknown>;
  allowed_users: string[];
}> {
  const rows = interfacesModel.findActiveByType("discord");
  if (rows.length === 0 && process.env.DISCORD_BOT_TOKEN) {
    // Backwards-compat: auto-create a DB-backed interface so gateway auth works.
    const ownerId = getFallbackOwnerUserId();
    const allowedUsers = (process.env.DISCORD_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allowedGuilds = (process.env.DISCORD_ALLOWED_GUILDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const created = interfacesModel.create({
        type: "discord",
        name: "Discord (env)",
        owner_user_id: ownerId,
        config: {
          bot_token: process.env.DISCORD_BOT_TOKEN,
          allowed_guilds: allowedGuilds,
        },
        allowed_users: allowedUsers,
        is_active: true,
      } as any);

      return [
        {
          id: created.id,
          owner_user_id: (created as any).owner_user_id ?? ownerId,
          name: created.name,
          config: (interfacesModel.getDecryptedConfig(created.id) || {}) as Record<string, unknown>,
          allowed_users: interfacesModel.getAllowedUsers(created.id),
        },
      ];
    } catch {
      return [
        {
          id: -1,
          owner_user_id: ownerId,
          name: "Discord (env)",
          config: {
            bot_token: process.env.DISCORD_BOT_TOKEN,
            allowed_guilds: allowedGuilds,
          },
          allowed_users: allowedUsers,
        },
      ];
    }
  }

  return rows
    .map((r) => {
      const cfg =
        (interfacesModel.getDecryptedConfig(r.id) || {}) as Record<string, unknown>;
      return {
        id: r.id,
        owner_user_id: (r as any).owner_user_id ?? 1,
        name: r.name,
        config: cfg,
        allowed_users: interfacesModel.getAllowedUsers(r.id),
      };
    })
    .filter((r) => typeof r.config.bot_token === "string" && r.config.bot_token.length > 0);
}

function isAllowedGuild(
  cfg: Record<string, unknown>,
  guildId: string | null,
): boolean {
  const allowed = Array.isArray(cfg.allowed_guilds)
    ? cfg.allowed_guilds.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  if (allowed.length === 0) return true;
  if (!guildId) return true; // DMs ok
  return allowed.includes(guildId);
}

function isAllowedUser(allowedUsers: string[], userId: string): boolean {
  if (!allowedUsers || allowedUsers.length === 0) return true;
  return allowedUsers.includes(userId);
}

function extractMentionPrompt(message: Message, rawContent: string): string {
  const selfId = message.client.user?.id;
  if (!selfId) return "";

  return rawContent
    .replace(new RegExp(`<@!?${selfId}>`, "g"), "")
    .trim();
}

async function registerDiscordCommands(
  client: Client,
  instance: {
    id: number;
    owner_user_id: number;
    config: Record<string, unknown>;
  },
  logger: ReturnType<typeof createBotLogger>,
): Promise<void> {
  const token = String(instance.config.bot_token || "");
  const clientId = String(instance.config.client_id || "").trim();
  if (!token || !clientId) {
    logger.warn("Discord slash commands not registered; missing client_id or token", {
      interfaceId: instance.id,
      hasToken: !!token,
      hasClientId: !!clientId,
    });
    return;
  }

  const guildIds = Array.isArray(instance.config.allowed_guilds)
    ? instance.config.allowed_guilds.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : client.guilds.cache.map((guild) => guild.id);

  if (guildIds.length === 0) {
    logger.warn("Discord slash commands not registered; bot is not in any guilds yet", {
      interfaceId: instance.id,
    });
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  await Promise.all(
    guildIds.map(async (guildId) => {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
          body: DISCORD_COMMANDS,
        });
        logger.info("Registered Discord slash commands", {
          interfaceId: instance.id,
          guildId,
        });
      } catch (error) {
        logger.warn("Failed to register Discord slash commands", {
          interfaceId: instance.id,
          guildId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}

async function runDiscordPrompt(input: {
  instance: {
    id: number;
    owner_user_id: number;
    config: Record<string, unknown>;
    allowed_users: string[];
  };
  externalUserId: string;
  externalUsername: string | null;
  externalChatId: string;
  prompt: string;
}): Promise<{ text: string; receiptText: string | null; error?: string }> {
  const gatewayToken = String((input.instance.config as any).gateway_token || "");
  if (!gatewayToken || input.instance.id <= 0) {
    return {
      text: "",
      receiptText: null,
      error: "Gateway auth is not configured for this interface. Create/enable the interface in the admin panel.",
    };
  }

  let buffer = "";
  let finalText = "";
  let receiptText: string | null = null;

  for await (const evt of streamGatewayChat({
    baseUrl: getGatewayBaseUrl(),
    interfaceId: input.instance.id,
    interfaceToken: gatewayToken,
    body: {
      message: input.prompt,
      externalChatId: input.externalChatId,
      externalUserId: input.externalUserId,
      externalUsername: input.externalUsername,
      planMode: false,
      attachments: [],
    },
  })) {
    if (evt.type === "text_delta") {
      buffer += evt.text || "";
    } else if (evt.type === "tool_receipt") {
      receiptText = evt.text;
    } else if (evt.type === "done") {
      finalText = evt.fullText || buffer;
    } else if (evt.type === "error") {
      return {
        text: "",
        receiptText: null,
        error: evt.error || "Unknown error",
      };
    }
  }

  return {
    text: finalText || buffer || "No response.",
    receiptText,
  };
}

async function replyInChunks(
  send: (content: string) => Promise<unknown>,
  content: string,
): Promise<void> {
  const chunks = splitText(content || "No response.", MAX_MESSAGE_LEN);
  for (const chunk of chunks) {
    await send(chunk);
  }
}

async function startDiscordInstance(instance: {
  id: number;
  owner_user_id: number;
  name: string;
  config: Record<string, unknown>;
  allowed_users: string[];
}) {
  const logger = createBotLogger("discord", instance.owner_user_id);

  const token = String(instance.config.bot_token || "");
  const gatewayToken = String((instance.config as any).gateway_token || "");
  if (!token) return;
  if (!gatewayToken || instance.id <= 0) {
    logger.warn("Gateway token missing; cannot start discord instance for gateway mode", {
      interfaceId: instance.id,
    });
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info("Discord client ready", {
      interfaceId: instance.id,
      ownerUserId: instance.owner_user_id,
      botUser: c.user?.tag,
    });
    void registerDiscordCommands(client, instance, logger);
  });

  client.on(Events.MessageCreate, async (msg: Message) => {
    if (msg.author.bot) return;
    const externalUserId = msg.author.id;
    const guildId = msg.guild?.id ?? null;

    if (!isAllowedGuild(instance.config, guildId)) return;
    if (!isAllowedUser(instance.allowed_users, externalUserId)) return;
    if (isRateLimited(`${instance.id}:${externalUserId}`, { cooldownMs: COOLDOWN_MS })) {
      return;
    }

    const content = msg.content?.trim() || "";
    const isDm = msg.channel.isDMBased();
    const isAsk = content.startsWith("!ask ");
    const isMention = !isDm && msg.mentions.has(client.user?.id || "");
    const shouldRespond = isDm || isAsk || isMention;
    if (!shouldRespond) return;

    const prompt = isAsk
      ? content.slice("!ask ".length).trim()
      : isMention
        ? extractMentionPrompt(msg, content)
        : content;
    if (!prompt) return;

    try {
      if ("sendTyping" in msg.channel) {
        await (msg.channel as any).sendTyping();
      }
    } catch {}

    const externalChatId = isDm ? `dm:${externalUserId}` : String(msg.channelId);
    const result = await runDiscordPrompt({
      instance,
      externalUserId,
      externalUsername: msg.author.username,
      externalChatId,
      prompt,
    });
    if (result.error) {
      await msg.reply(`Error: ${result.error}`);
      return;
    }

    await replyInChunks((chunk) => msg.reply(chunk), result.text);

    if (result.receiptText) {
      await replyInChunks((chunk) => msg.reply(chunk), result.receiptText);
    }

    recordChannelEvent({
      channel: "discord",
      event: "message_processing",
      ok: true,
      details: {
        interfaceId: instance.id,
        ownerUserId: String(instance.owner_user_id),
        externalChatId,
        responseLength: result.text?.length,
      },
    });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const externalUserId = interaction.user.id;
    const guildId = interaction.guildId ?? null;

    if (!isAllowedGuild(instance.config, guildId)) {
      await interaction.reply({
        content: "This server is not allowed for this Discord interface.",
        ephemeral: true,
      });
      return;
    }

    if (!isAllowedUser(instance.allowed_users, externalUserId)) {
      await interaction.reply({
        content: "You are not allowed to use this Discord interface.",
        ephemeral: true,
      });
      return;
    }

    if (isRateLimited(`${instance.id}:${externalUserId}`, { cooldownMs: COOLDOWN_MS })) {
      await interaction.reply({
        content: "Please wait a moment before sending another request.",
        ephemeral: true,
      });
      return;
    }

    const command = interaction.commandName;
    if (command === "help") {
      await interaction.reply({
        ephemeral: true,
        content:
          "Use `/ask` to talk to Overseer. You can also DM the bot directly, mention it in a channel, or start a message with `!ask`.",
      });
      return;
    }

    if (command !== "ask") return;

    const prompt = interaction.options.getString("prompt", true).trim();
    if (!prompt) {
      await interaction.reply({
        content: "Please provide a prompt.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    const externalChatId = interaction.channelId
      ? String(interaction.channelId)
      : `interaction:${externalUserId}`;
    const result = await runDiscordPrompt({
      instance,
      externalUserId,
      externalUsername: interaction.user.username,
      externalChatId,
      prompt,
    });

    if (result.error) {
      await interaction.editReply(`Error: ${result.error}`);
      return;
    }

    const chunks = splitText(result.text || "No response.", MAX_MESSAGE_LEN);
    if (chunks.length > 0) {
      await interaction.editReply(chunks[0]!);
      for (const chunk of chunks.slice(1)) {
        await interaction.followUp({ content: chunk });
      }
    }

    if (result.receiptText) {
      const receiptChunks = splitText(result.receiptText, MAX_MESSAGE_LEN);
      for (const chunk of receiptChunks) {
        await interaction.followUp({ content: chunk });
      }
    }

    recordChannelEvent({
      channel: "discord",
      event: "message_processing",
      ok: true,
      details: {
        interfaceId: instance.id,
        ownerUserId: String(instance.owner_user_id),
        externalChatId,
        responseLength: result.text?.length,
        via: "slash-command",
      },
    });
  });

  await client.login(token);
}

async function main() {
  const instances = getActiveDiscordInterfaces();
  if (instances.length === 0) {
    const logger = createBotLogger("discord");
    logger.info(
      "Discord interface not enabled; no active interface rows found. Enable it in the admin panel.",
    );
    process.exit(0);
  }

  await Promise.all(instances.map((i) => startDiscordInstance(i)));
}

main().catch((err) => {
  const logger = createBotLogger("discord");
  logger.error("Discord runner failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
