import { describe, it, expect } from 'vitest';
import { ExpertResponseDetector } from '../expertResponseDetector';

const CONFIG = {
  minLength: 50,
  keywords: ['deploy', 'pipeline', 'credentials'],
  minReactions: 3,
};

describe('ExpertResponseDetector', () => {
  it('flags a long message containing a keyword', () => {
    const detector = new ExpertResponseDetector(CONFIG);
    const text = 'To deploy the service you need to run the pipeline script twice in staging first.';

    expect(detector.isHighValue({ text, reactionCount: 0 })).toBe(true);
  });

  it('does not flag a long message without any keyword', () => {
    const detector = new ExpertResponseDetector(CONFIG);
    const text = 'I think we should grab lunch together sometime this week, maybe Thursday works best for everyone.';

    expect(detector.isHighValue({ text, reactionCount: 0 })).toBe(false);
  });

  it('does not flag a short message even with a keyword', () => {
    const detector = new ExpertResponseDetector(CONFIG);

    expect(detector.isHighValue({ text: 'use the pipeline', reactionCount: 0 })).toBe(false);
  });

  it('flags a short message with enough reactions regardless of keywords', () => {
    const detector = new ExpertResponseDetector(CONFIG);

    expect(detector.isHighValue({ text: 'yep', reactionCount: 3 })).toBe(true);
  });

  it('does not flag a message below both thresholds', () => {
    const detector = new ExpertResponseDetector(CONFIG);

    expect(detector.isHighValue({ text: 'yep', reactionCount: 2 })).toBe(false);
  });
});
