import { describe, it, expect } from 'vitest';
import { SopTitle } from '../sopTitle.js';

describe('SopTitle.deriveFrom', () => {
  it('uses the whole message when short and single-line', () => {
    expect(SopTitle.deriveFrom('Rotate secrets every 90 days')).toBe('Rotate secrets every 90 days');
  });

  it('uses only the first non-empty line of a multi-line message', () => {
    expect(SopTitle.deriveFrom('Rotating secrets\n\nStep 1: log in to vault')).toBe('Rotating secrets');
  });

  it('skips leading blank lines', () => {
    expect(SopTitle.deriveFrom('\n\n  How to rotate secrets  \nmore detail')).toBe('How to rotate secrets');
  });

  it('collapses internal whitespace', () => {
    expect(SopTitle.deriveFrom('Rotate   secrets\tevery   90 days')).toBe('Rotate secrets every 90 days');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(SopTitle.deriveFrom('   \n  \n ')).toBe('');
  });

  it('truncates long text at a word boundary with an ellipsis', () => {
    const longText = 'word '.repeat(60).trim(); // 299 chars, well over the 200 limit
    const title = SopTitle.deriveFrom(longText);

    expect(title.length).toBeLessThanOrEqual(200);
    expect(title.endsWith('…')).toBe(true);
    expect(title.endsWith(' …')).toBe(false);
  });

  it('leaves text exactly at the limit untouched', () => {
    const exact = 'a'.repeat(200);
    expect(SopTitle.deriveFrom(exact)).toBe(exact);
  });
});
