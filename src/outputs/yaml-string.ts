export function quoteYamlString(value: string): string {
  // JSON supplies double-quote/backslash/control escaping. Also escape YAML
  // control characters and Unicode line separators to keep each scalar on one line.
  return JSON.stringify(value).replace(/[\u007f-\u009f\u2028\u2029\ufffe\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
