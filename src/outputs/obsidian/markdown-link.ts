/** Encode a literal POSIX-style relative vault path, separately from filename encoding. */
export function encodeMarkdownDestination(relativePath: string): string {
  return relativePath.split('/').map((segment) => encodeURIComponent(segment)
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

/** One-line literal Markdown text, with HTML/entities escaped separately. */
export function escapeMarkdownInline(value: string): string {
  return value.replace(/\r\n|[\u0000-\u001f\u007f\u0085\u2028\u2029]/g, ' ')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+\-.!|~]/g, '\\$&');
}
