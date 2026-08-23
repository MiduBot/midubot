# Chat Feedback via Manual Reactions

## Goal

Remove visible feedback controls from AI chatbot replies. Users can submit feedback only by manually adding `👍` or `👎` to an AI reply.

## Behavior

- Chatbot replies are sent as normal Discord messages without components or automatic reactions.
- `messageReactionAdd` handles manual reactions.
- Only `👍` maps to `up` and `👎` maps to `down`; other emojis are ignored.
- Feedback is accepted only when the reacted message is a tracked AI response and the reacting user is the original requester.
- Existing one-rating rule remains: a second rating is ignored as `already_rated`.
- The bot does not add, remove, or acknowledge reactions.

## Implementation

- Add a reaction event handler that filters bot users, partial/unavailable data as needed, and supported emoji names.
- Add a `ChatFeedbackService` lookup/rating path keyed by `responseMessageId`, preserving current requester authorization and atomic single-rating update.
- Register `GuildMessageReactions` client intent and `messageReactionAdd` listener.
- Remove chatbot feedback row generation and button interaction routing for `chatfb_*`.
- Replace button-focused tests with reaction and no-components coverage.

## Error Handling

Reaction processing must fail silently from Discord's perspective and log operational failures without disrupting message handling. Unknown messages, unsupported emojis, unauthorized users, and already-rated responses must not throw.

## Verification

- Unit tests cover supported/unsupported reactions, requester authorization, duplicate ratings, and normal replies without components.
- Run `bun test` and `bun run build`.
