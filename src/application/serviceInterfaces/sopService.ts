export interface ISopService {
  handleChannelMessage(channelId: string, authorId: string, text: string, messageTs: string): Promise<void>;
  handleReactionAdded(channelId: string, messageTs: string, reactionCount: number): Promise<void>;
  handleSopDecision(channelId: string, messageTs: string, accepted: boolean): Promise<void>;
}
