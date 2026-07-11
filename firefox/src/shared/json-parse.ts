/** Immich timeline bucket can be JSON-stringified twice (text column → string body). */
export function parseJsonMaybeDoubleEncoded(text: string): unknown {
  let data: unknown = JSON.parse(text);
  while (typeof data === 'string') {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      break;
    }
  }
  return data;
}
