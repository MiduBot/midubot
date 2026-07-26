import { mock } from "bun:test";
import type {
  Message,
  Guild,
  GuildMember,
  TextChannel,
  User,
  Client,
} from "discord.js";

export interface MockMessageOptions {
  id?: string;
  content?: string;
  guildId?: string | null;
  channelId?: string;
  author?: Partial<User> & { bot?: boolean; id?: string; tag?: string };
  attachments?: Array<{ url: string; contentType?: string }>;
  embeds?: Array<{
    url?: string | null;
    title?: string | null;
    description?: string | null;
    footer?: { text?: string } | null;
    author?: { url?: string | null } | null;
    fields?: Array<{ name: string; value: string }>;
  }>;
  deletable?: boolean;
  memberModeratable?: boolean;
  manageMessages?: boolean;
}

export function createMockUser(
  overrides: Partial<User> & { id?: string; bot?: boolean; tag?: string } = {},
): User {
  return {
    id: overrides.id ?? "111111111111111111",
    bot: overrides.bot ?? false,
    tag: overrides.tag ?? `User#${(overrides.id ?? "1111").slice(-4)}`,
    username: overrides.username ?? "tester",
    globalName: overrides.globalName ?? null,
    discriminator: overrides.discriminator ?? "0000",
    createdTimestamp: overrides.createdTimestamp ?? Date.now() - 365 * 86400000,
    ...overrides,
  } as unknown as User;
}

export function createMockMember(
  overrides: {
    id?: string;
    permissions?: { has: (perm: string) => boolean };
    roleIds?: string[];
    moderatable?: boolean;
    highestPosition?: number;
  } = {},
): GuildMember {
  const roleIds = new Set(overrides.roleIds ?? []);
  return {
    id: overrides.id ?? "111111111111111111",
    user: createMockUser({ id: overrides.id }),
    permissions: overrides.permissions ?? { has: () => false },
    roles: {
      cache: {
        has: (rid: string) => roleIds.has(rid),
        size: roleIds.size,
      },
      highest: { position: overrides.highestPosition ?? 1 },
    },
    moderatable: overrides.moderatable ?? true,
    timeout: mock(() => Promise.resolve()),
  } as unknown as GuildMember;
}

export function createMockTextChannel(
  overrides: {
    id?: string;
    name?: string;
    isSendable?: boolean;
    guildId?: string;
    messagesFetchResult?: Map<string, Message> | (() => Promise<unknown>);
  } = {},
): TextChannel {
  const id = overrides.id ?? "222222222222222222";
  const fetchImpl =
    typeof overrides.messagesFetchResult === "function"
      ? overrides.messagesFetchResult
      : async () => overrides.messagesFetchResult ?? new Map();

  return {
    id,
    name: overrides.name ?? "test-channel",
    type: 0,
    guildId: overrides.guildId ?? "g1",
    viewable: true,
    isSendable: () => overrides.isSendable ?? true,
    isTextBased: () => true,
    isText: () => true,
    isThread: () => false,
    messages: {
      fetch: mock(fetchImpl),
    },
    send: mock(() => Promise.resolve({} as unknown as Message)),
    delete: mock(() => Promise.resolve()),
    edit: mock(() => Promise.resolve()),
  } as unknown as TextChannel;
}

export function createMockGuild(
  overrides: {
    id?: string;
    channels?: Map<string, TextChannel>;
    me?: unknown;
  } = {},
): Guild {
  const id = overrides.id ?? "g1";
  const channels = overrides.channels ?? new Map();
  const me = overrides.me ?? {
    roles: { cache: { size: 1 }, highest: { position: 10 } },
    permissions: { has: () => true },
    fetch: mock(() => Promise.resolve()),
  };
  return {
    id,
    channels: {
      cache: channels as unknown as Guild["channels"]["cache"],
      fetch: mock(async () => new Map(channels)),
    },
    members: {
      me,
      fetch: mock(async () => new Map()),
      cache: new Map(),
    },
  } as unknown as Guild;
}

export function createMockMessage(
  opts: MockMessageOptions = {},
): Message {
  const id = opts.id ?? "333333333333333333";
  const author = createMockUser({
    id: opts.author?.id ?? "111111111111111111",
    bot: opts.author?.bot ?? false,
    tag: opts.author?.tag ?? "Test#0001",
    ...opts.author,
  });

  const attachmentsMap = new Map<string, { url: string; contentType: string }>();
  for (const att of opts.attachments ?? []) {
    attachmentsMap.set(att.url, {
      url: att.url,
      contentType: att.contentType ?? "image/png",
    });
  }

  const member = createMockMember({
    id: author.id,
    moderatable: opts.memberModeratable ?? true,
    permissions: {
      has: (perm: string | bigint) => {
        if (!opts.manageMessages) return false;
        const key = String(perm);
        return (
          key === "ManageMessages" ||
          key.includes("ManageMessages") ||
          key === "8192"
        );
      },
    },
  });

  const replyTarget = {
    id: "reply-" + id,
    edit: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve()),
  };

  const message: Message = {
    id,
    content: opts.content ?? "",
    author,
    channelId: opts.channelId ?? "222222222222222222",
    guildId: opts.guildId ?? "g1",
    guild: opts.guildId !== null
      ? createMockGuild({ id: opts.guildId ?? "g1" })
      : (null as unknown as Message["guild"]),
    attachments: {
      ...attachmentsMap,
      find: (fn: (a: { contentType?: string }) => boolean) => {
        for (const a of attachmentsMap.values()) {
          if (fn(a)) return a;
        }
        return undefined;
      },
      values: () => attachmentsMap.values() as unknown as IterableIterator<never>,
      size: attachmentsMap.size,
    } as unknown as Message["attachments"],
    embeds: (opts.embeds ?? []) as unknown as Message["embeds"],
    deletable: opts.deletable ?? true,
    member,
    delete: mock(() => Promise.resolve()),
    reply: mock(() => Promise.resolve(replyTarget as unknown as Message)),
    react: mock(() => Promise.resolve()),
    channel: {
      send: mock(() => Promise.resolve({} as unknown as Message)),
    },
  } as unknown as Message;

  return message;
}

export function createMockClient(): Client {
  return {
    channels: {
      fetch: mock(async () => null),
    },
    guilds: {
      fetch: mock(async () => new Map()),
    },
  } as unknown as Client;
}
