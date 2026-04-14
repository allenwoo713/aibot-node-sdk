import { describe, it, expect } from 'vitest';
import { chunkMessage } from './chunker';

describe('chunkMessage', () => {
  it('returns empty array for empty string', () => {
    expect(chunkMessage('', 10)).toEqual([]);
  });

  it('returns single chunk when text fits limit', () => {
    expect(chunkMessage('hello', 100)).toEqual(['hello']);
  });

  it('splits long ASCII text into multiple chunks', () => {
    const text = 'a'.repeat(10);
    expect(chunkMessage(text, 3)).toEqual(['aaa', 'aaa', 'aaa', 'a']);
  });

  it('respects multi-byte UTF-8 characters', () => {
    // Each Chinese character is 3 bytes in UTF-8.
    const text = '中'.repeat(5);
    const chunks = chunkMessage(text, 6); // max 6 bytes = 2 chars
    expect(chunks).toEqual(['中中', '中中', '中']);
  });

  it('handles emojis correctly', () => {
    const text = '😀'.repeat(4);
    const chunks = chunkMessage(text, 8); // emoji is 4 bytes
    expect(chunks).toEqual(['😀😀', '😀😀']);
  });

  it('handles exact boundary length', () => {
    const text = 'abc';
    expect(chunkMessage(text, 3)).toEqual(['abc']);
  });

  it('places oversized single character in its own chunk', () => {
    // A single 4-byte emoji with maxBytes=3 should still get its own chunk.
    expect(chunkMessage('😀', 3)).toEqual(['😀']);
  });
});
