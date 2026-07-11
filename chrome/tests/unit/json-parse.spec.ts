import { describe, expect, it } from 'vitest';
import { parseJsonMaybeDoubleEncoded } from '../../src/shared/json-parse';

describe('parseJsonMaybeDoubleEncoded', () => {
  it('parses object in one step', () => {
    const obj = { id: ['a'], ownerId: ['b'] };
    expect(parseJsonMaybeDoubleEncoded(JSON.stringify(obj))).toEqual(obj);
  });

  it('parses JSON string containing JSON object', () => {
    const inner = JSON.stringify({ id: ['x'], ownerId: ['y'] });
    const body = JSON.stringify(inner);
    expect(parseJsonMaybeDoubleEncoded(body)).toEqual({ id: ['x'], ownerId: ['y'] });
  });
});
