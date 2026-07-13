import type { WebClient } from '@slack/web-api';
import type { IUserInfoProvider } from '../../application/ports/index.js';

export class SlackUserInfoProvider implements IUserInfoProvider {
  readonly #client: WebClient;

  constructor(client: WebClient) {
    this.#client = client;
  }

  async getDisplayName(userId: string): Promise<string | null> {
    const result = await this.#client.users.info({ user: userId });
    const profile = result.user?.profile;
    return profile?.display_name || profile?.real_name || result.user?.real_name || null;
  }
}
