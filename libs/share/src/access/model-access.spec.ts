import { isModelAllowed } from './model-access';

describe('isModelAllowed', () => {
  it('allows every model when the list is empty or missing (existing orgs)', () => {
    expect(isModelAllowed([], 7)).toBe(true);
    expect(isModelAllowed(null, 7)).toBe(true);
    expect(isModelAllowed(undefined, 7)).toBe(true);
  });

  it('allows only listed models once a list is set', () => {
    expect(isModelAllowed([3, 7], 7)).toBe(true);
    expect(isModelAllowed([3, 7], 8)).toBe(false);
  });
});
