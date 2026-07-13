export interface IInterviewService {
  handleIncomingDirectMessage(userId: string, text: string, responseChannelId?: string): Promise<void>;
}
