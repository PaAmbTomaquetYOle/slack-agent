export interface IInterviewService {
  handleIncomingDirectMessage(userId: string, text: string): Promise<void>;
}
