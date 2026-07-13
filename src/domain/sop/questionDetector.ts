export interface QuestionDetectorConfig {
  minLength: number;
}

export interface CandidateQuestion {
  text: string;
}

export class QuestionDetector {
  readonly #minLength: number;

  constructor(config: QuestionDetectorConfig) {
    this.#minLength = config.minLength;
  }

  isQuestion(message: CandidateQuestion): boolean {
    const text = message.text.trim();
    if (text.length < this.#minLength) return false;

    // Strip URLs to avoid false positives with query strings containing '?'
    const textWithoutUrls = text.replace(/https?:\/\/[^\s]+/gi, '');

    if (textWithoutUrls.includes('?')) return true;

    // Detect interrogative words in English and Spanish.
    // Using \p{L} (any letter) to create robust word boundaries that work with accented characters.
    const interrogativeRegex = /(?:^|[^\p{L}])(who|what|where|when|why|how|qué|cómo|dónde|cuándo|por\s+qué|quién)(?:[^\p{L}]|$)/ui;
    
    return interrogativeRegex.test(textWithoutUrls);
  }
}
