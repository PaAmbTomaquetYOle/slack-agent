import { describe, it, expect } from 'vitest';
import { QuestionDetector } from '../questionDetector';

const CONFIG = { minLength: 15 };

describe('QuestionDetector', () => {
  it('flags a long enough message containing a question mark', () => {
    const detector = new QuestionDetector(CONFIG);

    expect(detector.isQuestion({ text: 'How do I deploy the staging environment?' })).toBe(true);
  });

  it('does not flag a long message without a question mark', () => {
    const detector = new QuestionDetector(CONFIG);

    expect(detector.isQuestion({ text: 'I deployed the staging environment yesterday.' })).toBe(false);
  });

  it('does not flag a short message even with a question mark', () => {
    const detector = new QuestionDetector(CONFIG);

    expect(detector.isQuestion({ text: 'why?' })).toBe(false);
  });

  it('trims whitespace before checking length', () => {
    const detector = new QuestionDetector(CONFIG);

    expect(detector.isQuestion({ text: '   why?   ' })).toBe(false);
  });
});
