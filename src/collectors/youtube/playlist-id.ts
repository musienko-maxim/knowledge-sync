/** Accept IDs without assuming a particular playlist prefix or length. */
export function parsePlaylistId(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('YouTube playlist input must not be empty.');
  if (/^[A-Za-z0-9_-]+$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid YouTube playlist URL or ID.');
  }

  const hosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];
  if (!['https:', 'http:'].includes(url.protocol) || !hosts.includes(url.hostname)
    || url.username || url.password || url.port) {
    throw new Error('Unsupported YouTube playlist URL. Use a youtube.com URL.');
  }

  const id = url.searchParams.get('list');
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error('YouTube URL must contain a valid list parameter.');
  }
  return id;
}
