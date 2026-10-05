/** A source collection; its title is mutable metadata, never identity. */
export interface KnowledgeCollection {
  source: string;
  sourceId: string;
  title: string;
}
