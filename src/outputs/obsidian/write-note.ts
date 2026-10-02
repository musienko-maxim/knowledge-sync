import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

/** Writes opaque UTF-8 text with lexical containment only; not atomic or symlink-safe. */
export async function writeObsidianNote(
  vaultPath: string,
  relativePath: string,
  content: string,
): Promise<void> {
  if (!vaultPath.trim()) throw new Error('Vault path must not be blank.');
  if (!relativePath.trim() || parse(relativePath).root) {
    throw new Error('Note path must be a non-empty relative path within the vault.');
  }

  // Native path parsing also rejects Windows drive-relative paths such as C:note.md.
  const vault = resolve(vaultPath);
  const destination = resolve(vault, relativePath);
  const fromVault = relative(vault, destination);
  if (!fromVault || fromVault === '..' || fromVault.startsWith(`..${sep}`) || isAbsolute(fromVault)) {
    throw new Error('Note path must resolve below the vault root without escaping it.');
  }

  // Check before recursive mkdir so a missing vault is never silently created.
  const vaultInfo = await stat(vault);
  if (!vaultInfo.isDirectory()) throw new Error('Vault path must be an existing directory.');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
}
