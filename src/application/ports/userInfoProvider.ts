export interface IUserInfoProvider {
  /** Resolve a Slack user ID to its display name, or null if it cannot be resolved. */
  getDisplayName(userId: string): Promise<string | null>;
}
