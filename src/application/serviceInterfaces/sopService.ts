export const SOP_ACCEPT_ACTION_ID = 'sop_accept';
export const SOP_DECLINE_ACTION_ID = 'sop_decline';

export interface ISopService {
  handleChannelMessage(channelId: string, authorId: string, text: string, messageTs: string): Promise<void>;
  handleReactionAdded(channelId: string, messageTs: string, reactionCount: number): Promise<void>;
  handleSopDecision(channelId: string, messageTs: string, accepted: boolean): Promise<void>;
}
