// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
  documents,
  type Document,
  type NewDocument,
  type DocumentStatus,
  type DocumentType,
} from "@/db/schema/index.js";

export async function createDocument(
  data: NewDocument
): Promise<Document | null> {
  const result = await db.insert(documents).values(data).returning();
  return result[0] ?? null;
}

export async function findDocumentById(id: string): Promise<Document | null> {
  const result = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  return result[0] ?? null;
}

export async function findDocumentByIdAndCampaignId(
  id: string,
  campaignId: string
): Promise<Document | null> {
  const result = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.campaignId, campaignId)))
    .limit(1);
  return result[0] ?? null;
}

export interface FindDocumentsOptions {
  status?: DocumentStatus | undefined;
  documentType?: DocumentType | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function findDocumentsByCampaignId(
  campaignId: string,
  options: FindDocumentsOptions = {}
): Promise<Document[]> {
  const { status, documentType, limit = 50, offset = 0 } = options;

  let query = db
    .select()
    .from(documents)
    .where(eq(documents.campaignId, campaignId))
    .$dynamic();

  if (status) {
    query = query.where(
      and(eq(documents.campaignId, campaignId), eq(documents.status, status))
    );
  }

  if (documentType) {
    query = query.where(
      and(
        eq(documents.campaignId, campaignId),
        eq(documents.documentType, documentType)
      )
    );
  }

  return query.orderBy(desc(documents.createdAt)).limit(limit).offset(offset);
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentStatus,
  error?: string
): Promise<Document | null> {
  const updateData: Partial<Document> = { status };
  if (error !== undefined) {
    updateData.processingError = error;
  }

  const result = await db
    .update(documents)
    .set(updateData)
    .where(eq(documents.id, id))
    .returning();
  return result[0] ?? null;
}

export async function updateDocumentChunkCount(
  id: string,
  chunkCount: number
): Promise<Document | null> {
  const result = await db
    .update(documents)
    .set({ chunkCount, status: "ready" as DocumentStatus })
    .where(eq(documents.id, id))
    .returning();
  return result[0] ?? null;
}

export async function deleteDocument(
  id: string,
  campaignId: string
): Promise<Document | null> {
  const result = await db
    .delete(documents)
    .where(and(eq(documents.id, id), eq(documents.campaignId, campaignId)))
    .returning();
  return result[0] ?? null;
}
