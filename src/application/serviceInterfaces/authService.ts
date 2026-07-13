import type { AuthProvider } from '../../domain/index.js';

export const JIRA_AUTH_ACTION_ID = 'jira_start_auth';
export const TRELLO_AUTH_ACTION_ID = 'trello_start_auth';

export interface IAuthService {
  initiateAuth(provider: AuthProvider, userId: string, originChannelId: string): Promise<void>;
  handleAuthCodeMessage(userId: string, text: string): Promise<void>;
  hasPendingAuth(userId: string): boolean;
  isAuthErrorMessage(message: string): boolean;
}
