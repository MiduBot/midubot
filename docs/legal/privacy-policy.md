# Privacy Policy — Midubot

**Last updated:** August 12, 2026

This Privacy Policy explains how **Midubot** (the “Bot” or the “Service”) processes information when it runs on Discord servers, including the [midu.dev](https://midu.dev/) community server.

It should be read together with the [Terms of Service](./terms-of-service.md).

> This policy is based on the Bot’s actual data stores, features, and integrations. It is not legal advice. The Operator should complete contact details and adapt wording to their jurisdiction (e.g. GDPR/UK GDPR) before relying on it publicly.

---

## 1. Who is responsible

**Controller / Operator:** the person or team that deploys and operates the Midubot instance (database, Discord token, AI keys, hosting).

**Contact:** `[CREATE A ISSUE]`  
You may also reach the Operator via staff on the Discord server where the Bot is used, or through the project’s public repository channels (e.g. GitHub issues for the maintainer).

On a given Discord server, **server administrators** decide to invite the Bot and configure which features are enabled. Discord Inc. independently processes data under Discord’s own privacy policy when you use Discord.

## 2. Scope

This policy covers data processed by the **operated Midubot instance** (application logic, Turso/libSQL database, application logs, and outbound calls to the configured AI provider).

It does **not** cover:

- Discord’s own processing as a platform;
- Other bots or integrations on the same server;
- Third-party sites linked from messages the Bot inspects.

## 3. What data we process

Midubot does not create separate user accounts. It mainly processes **Discord identifiers** and content Discord delivers to the Bot.

### 3.1 Discord identifiers and metadata

Depending on the feature, we may process:

- Guild (server) ID
- User / member IDs (authors, reporters, executors, notify targets, whitelist entries)
- Channel, category, message, and role IDs
- Timestamps of events and stored records
- Limited public profile fields shown in alerts (e.g. username next to a user ID in a log embed)

### 3.2 Message and moderation content

When moderation or related features run, we may process:

| Data | Examples / purpose |
| --- | --- |
| Message text | AI classification, job-guard filtering, line filter, report quorum, Puff text matching, stored AI/job-guard cases |
| URLs | Link cooldown (URL + hash), image URLs for fingerprinting, content inspection |
| Attachments (images) | Downloaded temporarily to compute perceptual/difference hashes; fingerprints and source URL may be stored |
| Moderation notes | Free-text notes staff write about a user (`mod_notes`) |
| Moderation action log | Action type, executor ID, target user ID, reason/detail (`mod_actions`) |
| AI / job-guard cases | Author ID, channel/message IDs, content excerpt, verdict, confidence, reason, actions taken, staff resolution/feedback |
| Malicious-message examples | Message text labeled malicious/clean for AI context learning |
| AI prompt notes | Staff-derived prompt snippets used to reduce false positives |
| AI chat metrics | Request/response message IDs, requester ID, model, latency, token counts, finish reason, and optional thumbs-up/down rating; the chat text is not duplicated in this metrics table |

Message content sent to AI is typically truncated (on the order of a few thousand characters per message in current code).

### 3.3 Image fingerprints

For the image registry and duplicate detection, the Bot may store:

- Perceptual / difference hashes (e.g. dHash, pHash, aHash), color signature, width/height
- Original image URL and a staff-chosen name
- Guild ID and creation time

The Bot is designed to store **fingerprints and metadata**, not a full permanent binary blob of every scanned image in the database. Images may still be fetched from Discord/CDN URLs at processing time.

### 3.4 Server configuration

Per guild, the Bot may store settings such as:

- Preferred language (`es` / `en`)
- Feature toggles and thresholds (line filter, AI mod, link-newcomer, etc.)
- Log channel ID
- Unique-channel settings and the last message ID per user in that channel
- Link-cooldown channel rules and recent link entries
- Whitelist entries (role / member / permission)
- AI-mod roles, ignored channels/categories, notify targets, self-promo bypass channels
- AI chatbot channel and response mode (ambient or mentions/replies only)

### 3.5 Temporary in-memory data

Some data lives only in process memory for a short time, for example:

- Community report quorum state (reporter IDs + referenced message), with a TTL on the order of tens of minutes
- Caches (configuration, image fingerprints, sanction cache, etc.) that expire or are invalidated
- AI chatbot cooldown, queue, and recent-conversation state used to prevent abuse

Restarting the process clears pure in-memory state; database records remain.

### 3.6 Operational logs

The Bot writes application logs to the console (Winston). Logs may include error messages, guild/user IDs, and operational diagnostics. Retention depends on the hosting environment configured by the Operator (e.g. Coolify/Docker log retention).

### 3.7 Health checks

An HTTP health endpoint (e.g. `GET /health`) may expose process readiness for infrastructure monitoring. It is not intended to expose personal message content.

## 4. Why we process data (purposes)

We process data to:

1. Provide moderation and administration features requested by server staff.
2. Enforce server rules automatically (filters, cooldowns, duplicate detection, AI-assisted classification).
3. Notify staff via log channels and configured notify targets.
4. Keep an audit trail of moderation actions, notes, and AI cases for staff review and feedback loops.
5. Remember per-server configuration.
6. Operate, secure, and debug the Service (logs, health checks).
7. Comply with legal obligations when applicable.

**Legal bases** (where GDPR/UK GDPR or similar laws apply) typically include:

- **Legitimate interests** of the Operator and server community in safety, spam/scam prevention, and moderation tooling;
- **Contract / terms** with administrators who invite and configure the Bot;
- **Legal obligation** when required;
- In limited cases, measures based on the server’s own rules and Discord’s platform permissions.

Server administrators are responsible for informing their members that Midubot is active and what it does, where local rules require transparency.

## 5. How features use data (summary)

| Feature | Main processing |
| --- | --- |
| Image monitor / Puff | Fetch image → compute hashes → compare → delete matches / timeout as configured; may add fingerprints to DB |
| Unique channel | Store last message ID per user; delete previous message when a new one is posted |
| Link cooldown | Store recent URLs/hashes per user/channel within a time window |
| Link newcomer | Check join age vs threshold; delete link messages from recent members |
| Line filter | Inspect message structure/content in memory; delete when risk score exceeds threshold |
| Job-guard | On a configured channel, send message text to AI; may delete and store a case; alert log channel |
| AI mod | On mod-role mention (when enabled), classify candidate messages via AI; may timeout, delete, store cases/examples, alert notify targets |
| Reports | In-memory quorum of reporters; on quorum, moderation/logging actions |
| Notes / history / stats | Persist and display staff notes and action history |
| Whitelist / lang / log | Store configuration IDs and language preference |

## 6. Who we share data with

We do **not** sell personal data. We share or disclose data only as needed to run the Service:

### 6.1 Discord

All Bot activity goes through Discord’s API. Discord processes messages, IDs, and interactions under Discord’s privacy policy.

### 6.2 Database provider (Turso / libSQL)

Persistent Bot state is stored in a **Turso (libSQL)** database configured by the Operator (`TURSO_CONNECTION_URL` / auth token). That provider hosts the tables described above (guild config, cases, notes, images metadata, etc.).

### 6.3 AI provider

When AI features are enabled and credentials are set, message text and contextual examples/prompts are sent to an **OpenAI-compatible endpoint** configured by the Operator (`AI_API_URL`, `AI_API_KEY`, `AI_MODEL`, and optional `AI_CHAT_MODEL`; default model names may be DeepSeek-compatible). When chatbot vision is explicitly enabled, up to two image attachments from the relevant message may also be made available to that provider through their Discord CDN URLs.

That provider processes the submitted data to return a classification verdict or chatbot response. Their retention and training practices are governed by **their** terms and privacy policy, and by the Operator’s contract with them. Do not enable AI features if you cannot accept that outbound processing.

### 6.4 Hosting / monitoring

The Bot may run on container/hosting platforms (e.g. Docker/Coolify). Hosting providers may process IP connections to health endpoints and retain infrastructure logs.

### 6.5 Server staff

Configured log channels and notify targets receive embeds that can include message excerpts, usernames, and Discord IDs so staff can review moderation events.

### 6.6 Legal and safety

We may disclose data if required by law, valid legal process, or to protect the rights, safety, and integrity of users, the Operator, or the Service.

## 7. International transfers

Discord, Turso, the AI provider, and hosting may process data in countries other than yours. Where required, the Operator relies on appropriate transfer mechanisms offered by those providers (e.g. standard contractual clauses) or on your agreement to use a global Discord community service.

## 8. Retention

Current product behavior does **not** implement a single automatic purge schedule for all database tables. In practice:

| Category | Retention (as implemented) |
| --- | --- |
| Guild configuration, whitelist, channel settings | Until changed/removed by staff or the Operator deletes the guild’s data |
| Image fingerprints | Until removed via Bot commands or Operator deletion |
| Link-cooldown entries | Used within configured windows; historical rows may remain until cleaned by Operator tooling |
| Unique-channel last message pointers | Until reset/replaced |
| Mod notes / mod actions | Until Operator or authorized deletion processes remove them |
| AI mod / job-guard cases, examples, prompts | Until removed by staff workflows or Operator deletion |
| In-memory reports / caches | Minutes to process lifetime (reports roughly ~30 minutes TTL in current code) |
| Application logs | Per hosting log retention |

If you need a formal retention schedule (e.g. “delete AI cases after 90 days”), ask the Operator to implement and document it.

## 9. Security

The Operator protects the Service with measures appropriate to a Discord bot deployment, including:

- Secrets kept in environment variables (Discord token, DB token, AI key), not in the public repository;
- Access to privileged commands limited by Discord permissions, whitelist, and Operator allowlists;
- Use of managed database and hosting providers.

No method of transmission or storage is 100% secure. If you believe there is a vulnerability affecting personal data, contact the Operator promptly.

## 10. Your rights

Depending on your location, you may have rights to access, correct, delete, restrict, or object to certain processing, and to data portability or complaint to a supervisory authority.

Because Midubot keys records primarily by **Discord snowflake IDs**, requests usually require your Discord user ID and the relevant server context.

**How to exercise rights:**

1. For server-scoped settings staff can already change (language, ignored channels, image registry entries, etc.), ask server moderators first.
2. For database deletion/access beyond staff commands, contact the Operator using the contact details above.
3. You can also stop further Bot processing in a server by having administrators remove Midubot from that server.

We may need to verify your identity (e.g. prove control of the Discord account) and may retain data when we have a lawful reason (security, dispute, legal obligation).

## 11. Children

The Bot is intended for Discord communities that already comply with Discord’s age requirements. Midubot does not knowingly target children or seek extra personal data from them. If you believe we have stored data inconsistently with applicable child-protection rules, contact the Operator to request deletion.

## 12. Automated decision-making

Some features apply **automated moderation actions** (message deletion, timeouts) based on filters or AI classification scores/thresholds, sometimes with staff review afterward (alerts, feedback buttons, case resolution).

These systems can be wrong. Staff should review material cases. You can contest an automated action through the server’s moderation staff; they control Discord sanctions and Bot configuration.

## 13. Cookies and tracking

Midubot is a Discord bot, not a website analytics product. It does not use browser cookies. Any web health endpoint is for infrastructure checks only.

## 14. Changes to this policy

We may update this Privacy Policy by publishing a new version with a revised “Last updated” date. Material changes should be communicated in a reasonable way (server announcement, repository notice, or release notes). Continued use of the Bot after an update means you acknowledge the revised policy where applicable.

## 15. Data inventory (technical reference)

For transparency, the main persistent tables in the Bot’s schema include approximately:

- `guild_configs` — language and feature flags/thresholds  
- `images` — image fingerprints and source URLs  
- `whitelists` — authorized roles/members/permissions  
- `unique_channels` / `unique_messages` — one-message channel config and per-user last message  
- `log_channels` — moderation log channel  
- `link_cooldown_channels` / `link_cooldown_entries` — link limits and recent URLs  
- `mod_actions` / `mod_notes` — staff action audit and notes  
- `ai_mod_*` — AI mod roles, ignores, notify targets, bypass channels, examples, prompts, cases  
- `job_guard_cases` / `job_guard_prompts` — job-channel AI cases and prompt notes  

This inventory may evolve with product updates; the source of truth is the Bot’s database schema in the repository.

---

If this policy and the product diverge after a release, the Operator should update this document promptly.
