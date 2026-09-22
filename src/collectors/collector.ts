import type { KnowledgeItem } from '../core/models/knowledge-item.js';

/** Source-specific configuration and raw payloads belong to implementations. */
export interface Collector {
  collect(): Promise<KnowledgeItem[]>;
}
