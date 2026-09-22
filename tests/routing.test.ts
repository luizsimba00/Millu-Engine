import { describe, expect, it } from 'vitest';
import { routeSku, RoutingError } from '../src/routing.js';

describe('routeSku', () => {
  it('roteia SKU da empresa A', () => {
    expect(routeSku('MIL-A-001').company.key).toBe('a');
  });

  it('roteia SKU da empresa B sem considerar caixa', () => {
    expect(routeSku('mil-b-001').company.key).toBe('b');
  });

  it('rejeita SKU sem regra', () => {
    expect(() => routeSku('OUTRO-001')).toThrow(RoutingError);
  });
});
