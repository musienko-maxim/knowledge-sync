import { describe, expect, it } from 'vitest';
import { parsePlaylistId } from '../src/collectors/youtube/playlist-id.js';

describe('YouTube playlist input', () => {
  it.each([
    ['PLxxxxxxxxxxxxxxxx', 'PLxxxxxxxxxxxxxxxx'],
    ['  arbitrary_ID-123  ', 'arbitrary_ID-123'],
    ['x', 'x'],
    ['https://www.youtube.com/playlist?list=PL123', 'PL123'],
    ['https://www.youtube.com/watch?v=abc123&list=PL123&t=3', 'PL123'],
    ['https://youtube.com/playlist?list=PL123#fragment', 'PL123'],
    ['https://m.youtube.com/watch?list=PL123&v=abc', 'PL123'],
  ])('parses %s', (input, expected) => {
    expect(parsePlaylistId(input)).toBe(expected);
  });

  it.each([
    '', '  ', 'https://', 'https://[invalid', 'https//youtube.com/playlist?list=PL123',
    'https://www.youtube.com/watch?v=abc123', 'https://www.youtube.com/playlist?list=',
    'https://www.youtube.com/playlist?list=%20', 'https://www.youtube.com/playlist?list=a%26b',
    'https://example.com/playlist?list=PL123', 'https://youtube.com.example.com/?list=PL123',
    'https://youtube.com@evil.example/?list=PL123', 'ftp://youtube.com/?list=PL123',
    'www.youtube.com/playlist?list=PL123', 'not a playlist',
  ])('rejects %j', (input) => {
    expect(() => parsePlaylistId(input)).toThrow(/YouTube/);
  });
});
