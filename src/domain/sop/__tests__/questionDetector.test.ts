import { describe, it, expect } from 'vitest';
import { QuestionDetector } from '../questionDetector.js';

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

  it('flags messages with English interrogative words even without a question mark', () => {
    const detector = new QuestionDetector(CONFIG);

    expect(detector.isQuestion({ text: 'how do I deploy the staging environment' })).toBe(true);
    expect(detector.isQuestion({ text: 'I need to know what the procedure is' })).toBe(true);
  });

  it('flags messages with Spanish interrogative words even without a question mark', () => {
    const detector = new QuestionDetector(CONFIG);

    expect(detector.isQuestion({ text: 'cómo despliego el entorno de staging' })).toBe(true);
    expect(detector.isQuestion({ text: 'alguien sabe por qué falla la build' })).toBe(true);
  });

  it('ignores false positives from URLs with query strings', () => {
    const detector = new QuestionDetector(CONFIG);

    // This is long enough and contains '?', but it's part of a URL
    expect(detector.isQuestion({ text: 'Check out this link: https://example.com/page?param=123' })).toBe(false);
  });

  it('flags actual questions that also contain URLs', () => {
    const detector = new QuestionDetector(CONFIG);

    expect(detector.isQuestion({ text: 'Why is this failing? https://example.com/page?param=123' })).toBe(true);
  });
});
