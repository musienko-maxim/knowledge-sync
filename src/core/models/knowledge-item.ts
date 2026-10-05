import { z } from 'zod';

export const knowledgeItemSchema = z.object({
  source: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  // Legacy display metadata; CollectionMembership is authoritative for membership.
  collection: z.string().optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
});

export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;
export type ItemIdentity = Pick<KnowledgeItem, 'source' | 'sourceId'>;
