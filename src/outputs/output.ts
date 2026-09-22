import type { KnowledgeItem } from '../core/models/knowledge-item.js';

/** Future writers must produce deterministic output for unchanged items. */
export interface Output {
  write(item: KnowledgeItem): Promise<void>;
}
