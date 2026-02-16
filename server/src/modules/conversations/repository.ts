import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
  conversations,
  conversationMessages,
  type ConversationRow,
  type ConversationMessageRow,
  type NewConversation,
  type NewConversationMessage,
} from "@/db/schema/index.js";

export async function createConversation(
  data: Pick<NewConversation, "campaignId" | "userId" | "title">
): Promise<ConversationRow | null> {
  const result = await db.insert(conversations).values(data).returning();
  return result[0] ?? null;
}

export async function findConversationsByCampaignAndUser(
  campaignId: string,
  userId: string
): Promise<ConversationRow[]> {
  return db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.campaignId, campaignId),
        eq(conversations.userId, userId)
      )
    )
    .orderBy(desc(conversations.updatedAt));
}

export async function findConversationById(
  conversationId: string,
  campaignId: string,
  userId: string
): Promise<ConversationRow | null> {
  const result = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.campaignId, campaignId),
        eq(conversations.userId, userId)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function findMessagesByConversationId(
  conversationId: string
): Promise<ConversationMessageRow[]> {
  return db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(conversationMessages.createdAt);
}

export async function addMessages(
  messages: Pick<
    NewConversationMessage,
    "conversationId" | "role" | "content" | "sources" | "confidence"
  >[]
): Promise<ConversationMessageRow[]> {
  if (messages.length === 0) return [];
  return db.insert(conversationMessages).values(messages).returning();
}

export async function touchConversation(
  conversationId: string
): Promise<void> {
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function deleteConversation(
  conversationId: string,
  campaignId: string,
  userId: string
): Promise<ConversationRow | null> {
  const result = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.campaignId, campaignId),
        eq(conversations.userId, userId)
      )
    )
    .returning();
  return result[0] ?? null;
}
