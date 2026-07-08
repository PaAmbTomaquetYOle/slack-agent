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
    const trimmed = message.text.trim();
    if (trimmed.length < this.#minLength) return false;
    return trimmed.includes('?');
  }
}
