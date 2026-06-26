import type { WebClient } from '@slack/web-api';
import type { IMessagingPort } from '../../application/ports';

export class SlackMessagingAdapter implements IMessagingPort {
  readonly #client: WebClient;

  constructor(client: WebClient) {
    this.#client = client;
  }

  async sendDirectMessage(userId: string, text: string): Promise<void> {
    const result = await this.#client.conversations.open({ users: userId });
    const channelId = result.channel?.id;
    if (!channelId) {
      throw new Error(`Could not open DM channel with user ${userId}`);
    }
    await this.#client.chat.postMessage({ channel: channelId, text });
  }
}
