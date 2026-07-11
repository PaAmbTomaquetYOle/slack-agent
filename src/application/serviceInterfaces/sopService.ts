export const SOP_ACCEPT_ACTION_ID = 'sop_accept';
export const SOP_DECLINE_ACTION_ID = 'sop_decline';

export interface ISopService {
  isMonitoredChannel(channelId: string): boolean;
  handleChannelMessage(channelId: string, authorId: string, text: string, messageTs: string): Promise<void>;
  handleReactionAdded(channelId: string, messageTs: string, reactionCount: number): Promise<void>;
  handleSopDecision(channelId: string, messageTs: string, accepted: boolean, title?: string): Promise<void>;
  /** Derives a default title for the candidate, to prefill the "save as SOP" modal. */
  deriveSopTitle(channelId: string, messageTs: string): string | null;
  /** Rehydrates candidates still awaiting a decision from the backend (SA-16). Call once on startup. */
  rehydrate(): Promise<void>;
}
