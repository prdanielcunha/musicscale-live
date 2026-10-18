import { expect, it } from 'vitest';
import { createSseParser } from './x32StreamParser';
it('retains partial frames across chunks, supports CRLF and ignores heartbeats', () => {
  const values: string[] = [];
  const parse = createSseParser(value => values.push(value));
  parse(': heartbeat\n\ndata: {"name":"Jo');
  expect(values).toEqual([]);
  parse('ão"}\n');
  parse('\ndata: {"connected":false}\r\n\r');
  parse('\n');
  expect(values).toEqual(['{"name":"João"}', '{"connected":false}']);
});
it('bounds memory for an invalid infinite frame', () => {
  expect(() => createSseParser(() => undefined)('a'.repeat(512001))).toThrow('mixer_stream_frame_too_large');
});
