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

  it('sendEphemeralActionPrompt() posts an ephemeral message with action buttons', async () => {
    await adapter.sendEphemeralActionPrompt('C123', 'U1', 'Save this as an SOP?', [
      { actionId: 'sop_accept', text: 'Yes, save it', value: '1234.5678' },
      { actionId: 'sop_decline', text: 'No thanks', value: '1234.5678' },
    ]);

    expect(client.chat.postEphemeral).toHaveBeenCalledWith({
      channel: 'C123',
      user: 'U1',
      text: 'Save this as an SOP?',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: 'Save this as an SOP?' } },
        {
          type: 'actions',
          elements: [
            { type: 'button', action_id: 'sop_accept', text: { type: 'plain_text', text: 'Yes, save it' }, value: '1234.5678' },
            { type: 'button', action_id: 'sop_decline', text: { type: 'plain_text', text: 'No thanks' }, value: '1234.5678' },
          ],
        },
      ],
    });
  });

  it('sendEphemeralMessage() posts a plain ephemeral message with no action buttons', async () => {
    await adapter.sendEphemeralMessage('C123', 'U1', 'Found some related content that might help:');

    expect(client.chat.postEphemeral).toHaveBeenCalledWith({
      channel: 'C123',
      user: 'U1',
      text: 'Found some related content that might help:',
    });
  });

  it('sendChannelMessage() posts a plain message to the given channel', async () => {
    await adapter.sendChannelMessage('C-managers', 'The handover dossier is ready.');

    expect(client.chat.postMessage).toHaveBeenCalledWith({
      channel: 'C-managers',
      text: 'The handover dossier is ready.',
    });
  });

  it('createChannelCanvas() creates a Canvas tied to the channel with markdown content', async () => {
    await adapter.createChannelCanvas('C-managers', 'Handover Dossier — Alice', '# Summary\n\nAlice led the migration.');

    expect(client.conversations.canvases.create).toHaveBeenCalledWith({
      channel_id: 'C-managers',
      title: 'Handover Dossier — Alice',
      document_content: { type: 'markdown', markdown: '# Summary\n\nAlice led the migration.' },
    });
  });
});
