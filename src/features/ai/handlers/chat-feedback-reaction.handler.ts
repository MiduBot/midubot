import type { MessageReaction, User } from "discord.js";
import { logger } from "@/core/logger";
import {
  ChatFeedbackService,
  type ChatFeedbackRating,
} from "../services/chat-feedback.service";

const reactionRatings: Record<string, ChatFeedbackRating> = {
  "👍": "up",
  "👎": "down",
};

export async function handleChatFeedbackReaction(
  reaction: MessageReaction,
  user: User,
): Promise<void> {
  if (user.bot) return;

  let resolvedReaction = reaction;
  if (reaction.partial) {
    try {
      resolvedReaction = await reaction.fetch();
    } catch (error) {
      logger.warn(`ai chat feedback: failed to fetch reaction: ${error}`);
      return;
    }
  }

  const rating = reactionRatings[resolvedReaction.emoji.name ?? ""];
  if (!rating) return;

  try {
    await ChatFeedbackService.rateResponse(
      resolvedReaction.message.id,
      user.id,
      rating,
    );
  } catch (error) {
    logger.warn(`ai chat feedback: failed to record reaction: ${error}`);
  }
}
