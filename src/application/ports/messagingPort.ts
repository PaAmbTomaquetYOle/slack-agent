export interface EphemeralAction {
  actionId: string;
  text: string;
  value: string;
}

export interface IMessagingPort {
  sendDirectMessage(userId: string, text: string): Promise<void>;
  sendEphemeralActionPrompt(
    channelId: string,
    userId: string,
    text: string,
    actions: EphemeralAction[],
  ): Promise<void>;
}
