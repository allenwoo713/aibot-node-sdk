/**
 * Split a long string into chunks that each fit within a byte limit.
 * Respects multi-byte UTF-8 characters (Chinese, emoji) — never splits mid-character.
 */
export function chunkMessage(text: string, maxBytes = 2048): string[] {
  if (!text) return [];

  const chunks: string[] = [];
  let currentChunk = '';
  let currentBytes = 0;

  // Iterate by Unicode code points to avoid splitting surrogate pairs.
  for (const char of text) {
    const charBytes = Buffer.byteLength(char, 'utf8');

    if (currentBytes + charBytes > maxBytes && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = char;
      currentBytes = charBytes;
    } else {
      currentChunk += char;
      currentBytes += charBytes;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
