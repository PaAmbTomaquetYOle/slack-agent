export interface IReviewInterviewService {
  /**
   * Processes an incoming Slack DM as a review-interview answer, if the sender has an active
   * review process. No-ops silently if they don't (SA-20, mirrors IInterviewService).
   */
  handleIncomingDirectMessage(userId: string, text: string): Promise<void>;
}
