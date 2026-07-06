import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackMessagingAdapter } from '../slackMessagingAdapter';
import { makeWebClientMock, type WebClientMock } from '../../../testing/slackMocks';

describe('SlackMessagingAdapter', () => {
  let client: WebClientMock;
  let adapter: SlackMessagingAdapter;

  beforeEach(() => {
    client = makeWebClientMock();
    adapter = new SlackMessagingAdapter(client);
  });

  it('sendDirectMessage() opens a DM and posts the message to it', async () => {
    vi.mocked(client.conversations.open).mockResolvedValue({ ok: true, channel: { id: 'D123' } } as never);

    await adapter.sendDirectMessage('U1', 'hello there');

    expect(client.conversations.open).toHaveBeenCalledWith({ users: 'U1' });
    expect(client.chat.postMessage).toHaveBeenCalledWith({ channel: 'D123', text: 'hello there' });
  });

  it('sendDirectMessage() throws when no DM channel id is returned', async () => {
    vi.mocked(client.conversations.open).mockResolvedValue({ ok: true, channel: undefined } as never);

    await expect(adapter.sendDirectMessage('U1', 'hello there')).rejects.toThrow(
      'Could not open DM channel with user U1',
    );
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });
});
