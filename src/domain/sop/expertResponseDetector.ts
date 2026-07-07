export interface ExpertResponseDetectorConfig {
  minLength: number;
  keywords: string[];
  minReactions: number;
}

export interface CandidateMessage {
  text: string;
  reactionCount: number;
}

export class ExpertResponseDetector {
  readonly #minLength: number;
  readonly #keywords: string[];
  readonly #minReactions: number;

  constructor(config: ExpertResponseDetectorConfig) {
    this.#minLength = config.minLength;
    this.#keywords = config.keywords;
    this.#minReactions = config.minReactions;
  }

  isHighValue(message: CandidateMessage): boolean {
    if (message.reactionCount >= this.#minReactions) return true;

    const isLongEnough = message.text.length >= this.#minLength;
    const hasKeyword = this.#keywords.some((keyword) =>
      message.text.toLowerCase().includes(keyword.toLowerCase()),
    );
    return isLongEnough && hasKeyword;
  }
}
