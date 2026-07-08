export interface InterviewTurn {
  readonly turnType: 'question' | 'note';
  readonly speakerRole: 'interviewer' | 'interviewee';
  readonly timestamp: Date;
  readonly content: string;
  readonly order: number;
  readonly topic: string | null;
  readonly sentiment: string | null;
  readonly answerText: string | null;
}
