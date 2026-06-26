export interface IMessagingPort {
  sendDirectMessage(userId: string, text: string): Promise<void>;
}
