import { quoteYamlString } from '../yaml-string.js';

export interface OwnedIdentity {
  readonly source: string;
  readonly sourceId: string;
}

/** An exact, versioned first YAML field; keeps Obsidian frontmatter recognizable. */
export function facebookOwnershipPrefix(entity: 'item' | 'collection', identity: OwnedIdentity): string {
  return `---\nknowledge_sync: ${quoteYamlString(JSON.stringify({
    version: 1, entity, source: identity.source, sourceId: identity.sourceId,
  }))}\n`;
}

/** Encode punctuation before Markdown parsing, including Obsidian embeds/math/highlights. */
export function escapeFacebookText(value: string, multiline = false): string {
  const normalized = value.replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g, ' ');
  return (multiline ? normalized : normalized.replace(/\n/g, ' '))
    .replace(/[!-/:-@\[-`{-~]/g, (character) => `&#${character.charCodeAt(0)};`);
}
