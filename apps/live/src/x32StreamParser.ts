/** Incremental SSE framing; a network chunk is not necessarily a whole message. */
export function createSseParser(onData: (data: string) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    if (buffer.length > 512_000) throw new Error('mixer_stream_frame_too_large');
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).replace(/^ /, '')).join('\n');
      if (data) onData(data);
    }
  };
}
