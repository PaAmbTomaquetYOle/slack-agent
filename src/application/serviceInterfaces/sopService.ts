export const SOP_ACCEPT_ACTION_ID = 'sop_accept';
export const SOP_DECLINE_ACTION_ID = 'sop_decline';

export interface ISopService {
  isMonitoredChannel(channelId: string): boolean;
  handleChannelMessage(channelId: string, authorId: string, text: string, messageTs: string): Promise<void>;
  handleReactionAdded(channelId: string, messageTs: string, reactionCount: number): Promise<void>;
  handleSopDecision(channelId: string, messageTs: string, accepted: boolean): Promise<void>;
  /** Rehydrates candidates still awaiting a decision from the backend (SA-16). Call once on startup. */
  rehydrate(): Promise<void>;
}
