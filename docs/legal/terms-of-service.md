# Terms of Service — Midubot

**Last updated:** August 12, 2026

These Terms of Service (“Terms”) govern use of the Discord bot **Midubot** (the “Service” or the “Bot”), a moderation and administration bot used, among other places, on the [midu.dev](https://midu.dev/) community Discord server.

By inviting the Bot to a server, configuring it, running its commands, or interacting with its automated features, you agree to these Terms. If you do not agree, do not use the Bot and ask the server administrators to remove it.

> This document reflects how the product actually works based on its code and configuration. It is not legal advice. The Operator may complete or adjust contact details and governing law as needed.

---

## 1. Definitions

- **Operator:** the person or team that deploys, maintains, and controls the Midubot instance covered by these Terms.
- **Server administrator / Staff:** users with Discord moderation permissions or Bot whitelist entries in a Discord server.
- **User / Member:** anyone whose messages, IDs, or activity may be processed by the Bot in a server where it is present.
- **Server (guild):** a Discord server where the Bot has been invited.

## 2. Description of the Service

Midubot is a Discord bot (Bun/TypeScript, discord.js) that provides, among others, the following capabilities:

| Area | Features |
| --- | --- |
| Images | Image fingerprint (hash) registry, duplicate detection, and removal of matches |
| Whitelist | Authorize roles, users, or permissions to use Bot commands |
| Channels | Log channel, Bot language (`es` / `en`), “one-message” channel (one visible message per user) |
| Automatic moderation | Long/suspicious message filter, per-channel link cooldown, link blocking for recent joiners |
| AI moderation | Message classification (spam/scams/self-promo and job posts) via an OpenAI-compatible AI provider |
| Apps / context menus | Community report quorum, moderation notes, history, Puff (duplicate sweep), etc. |
| System | Help, version, and restricted internal tools |

Exact feature availability depends on server configuration, the Bot’s Discord permissions, and deployment environment variables (for example, job-channel ID or AI credentials).

## 3. Relationship with Discord and third parties

1. Midubot runs **on Discord**. You must comply with the [Discord Terms of Service](https://discord.com/terms), [Community Guidelines](https://discord.com/guidelines), and other applicable Discord policies.
2. If these Terms conflict with Discord’s terms regarding use of the Discord platform, Discord’s terms prevail.
3. The Operator is not affiliated with or an official representative of Discord Inc., unless expressly stated otherwise.
4. The Bot may rely on third parties (database, AI provider, hosting). Those parties have their own terms.

## 4. Who may use the Service

- A Discord server may invite or use a Bot instance **if the Operator allows it**.
- Configuration and moderation commands typically require Discord’s **Manage Messages** permission or a Bot whitelist entry.
- Some features (for example, developer tools or “superdev” access) are restricted to Operator-authorized Discord user IDs.
- Use by minors is subject to Discord’s age rules and applicable law. The Operator does not intentionally collect minors’ data beyond what Discord exposes to the Bot.

## 5. Accounts and identity

Midubot does not create its own user accounts. It identifies you through **Discord IDs** (user, guild, channel, message, role) and, where relevant, message content or metadata Discord delivers to the Bot via its API.

You are responsible for activity performed with your Discord account in servers where Midubot is active.

## 6. Acceptable use

You must not, among other things:

1. Use the Bot to harass, discriminate against, extort, or harm others.
2. Attempt to evade, manipulate, or “jailbreak” the Bot’s AI classifiers or filters (including embedding deceptive instructions inside moderated messages).
3. Abuse commands, reports, context menus, or alerts to overwhelm staff or the Bot.
4. Interfere with Bot infrastructure (scanning, denial of service, unauthorized access to tokens, databases, or internal endpoints).
5. Use privileged features (for example, code evaluation or superuser access) without the Operator’s express authorization.
6. Violate applicable law, Discord’s terms, or the host server’s rules.

The Operator and server staff may restrict Bot access, ignore channels, disable features, or remove the Bot without notice for violations.

## 7. Automatic and AI-assisted moderation

### 7.1 Possible actions

Depending on configuration, Midubot may:

- Delete messages.
- Apply timeouts or other moderation actions available through Discord.
- Send alerts to a configured log channel or notify targets.
- Store moderation “cases” (content, verdict, confidence, reason, resolution).
- Learn from staff feedback (correct / incorrect) to adjust prompts or examples.

### 7.2 AI limitations

AI features (for example, moderation triggered by mentioning a configured mod role, and the job-offer filter on a configured channel):

- Send **message text** (and server example/prompt context) to an **external OpenAI-compatible AI provider** configured by the Operator.
- Are probabilistic systems: they can produce **false positives and false negatives**.
- **Do not replace** human staff judgment.
- May not “see” images; duplicate-image detection relies on fingerprints/hashes and the Bot’s own logic.

By enabling or keeping these features active, the server administrator accepts that error margin and the responsibility to review alerts and feedback.

### 7.3 Community reports

Some report features may run in memory with a limited time window (for example, a report quorum). That does not prevent later records from remaining in Discord (log channel) or in the Bot’s database (moderation actions, AI cases, etc.).

## 8. User content

1. You retain rights in content you post on Discord.
2. By posting in a server with Midubot, you authorize the Operator to process that content **as needed** to provide the moderation, configuration, and logging features described in the [Privacy Policy](./privacy-policy.md).
3. The Bot may store message excerpts, URLs, image hashes, and metadata tied to Discord IDs.
4. The Operator does not claim ownership of your Discord content merely by processing it.

## 9. Open-source software vs. operated Service

Midubot’s source code may be available under an open-source license (e.g. MIT, as indicated in the repository). That license governs **use of the source code**.

These Terms govern the **operated Service** (the production Bot instance, its database, secrets, and configuration). Access to the code does not grant a right to abuse the Operator’s instance or to demand a specific service level.

## 10. Availability and changes

1. The Service is provided “as is” and “as available.” No SLA, continuous uptime, or perpetual compatibility with Discord or third-party API changes is guaranteed.
2. The Operator may modify, suspend, or discontinue features (including AI features) at any time.
3. There may be an HTTP health endpoint (e.g. `/health`) for deployment monitoring only; it is not a public end-user API.

## 11. Privacy

Personal data processing is described in the [Privacy Policy](./privacy-policy.md). By using the Bot, you also accept that policy to the extent it applies to you.

## 12. Disclaimer of warranties

To the maximum extent permitted by law:

- The Bot is provided **without warranties** of merchantability, fitness for a particular purpose, or error-free operation.
- The Operator does not warrant that automatic moderation will catch all unwanted content or never act in error.

## 13. Limitation of liability

To the maximum extent permitted by law, the Operator and contributors are not liable for indirect damages, lost profits, data loss, Discord sanctions, host-server staff moderation decisions, or acts of third parties (Discord, AI provider, hosting, database).

The Operator’s aggregate liability to you, if any, is limited to zero (free Service) or to amounts you expressly paid the Operator for the Service in the three (3) months before the claim, if any paid plan exists.

Nothing in these Terms excludes liability that cannot be limited by law (e.g. willful misconduct or gross negligence, depending on jurisdiction).

## 14. Indemnity

You agree to defend and indemnify the Operator against claims arising from your unlawful use of the Bot, your breach of these Terms, or content you post that the Bot processes because of your activity.

## 15. Suspension and termination

The Operator may stop providing the Service to a server or user at any time. Administrators may kick the Bot from a server at any time via Discord. After removal, historical data may remain as described in the Privacy Policy until deleted or anonymized.

## 16. Changes to these Terms

We may update these Terms by publishing a new version in this repository or documentation channel, with a revised “Last updated” date. Continued use of the Bot after a reasonable notice period constitutes acceptance of the revised version. For material changes, the Operator will try to give reasonable notice (for example, a server announcement or release notes).

## 17. Assignment

You may not assign these Terms without the Operator’s consent. The Operator may assign them in connection with a reorganization, change of Bot operator, or similar transfer.

## 18. Governing law and contact

Unless the Operator states otherwise in writing:

- These Terms are interpreted under the laws applicable in the Operator’s country (midu.dev community / Spain, unless otherwise agreed).
- For questions about these Terms: contact the Operator through **staff on the Discord server** where the Bot runs, or via the project’s public repository channels (e.g. the maintainer’s GitHub issues).

If a formal contact email is required, the Operator should publish it here:

**Contact:** `[TO COMPLETE: Operator email or official channel]`

## 19. General

If any clause is held invalid, the remainder stays in effect. Failure to enforce a right is not a waiver. These Terms, together with the Privacy Policy, are the complete agreement regarding use of the operated Service, without prejudice to the host Discord server’s own rules.
