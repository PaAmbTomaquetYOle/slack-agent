import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ISopService } from '../../../application/serviceInterfaces';
import { SOP_ACCEPT_ACTION_ID, SOP_DECLINE_ACTION_ID } from '../../../application/serviceInterfaces';
import { SopController } from '../sopController';
import { makeAppMock, makeWebClientMock, makeAckFn } from '../../../testing/slackMocks';

function makeSopServiceMock(): ISopService {
  return {
    handleChannelMessage: vi.fn().mockResolvedValue(undefined),
    handleReactionAdded: vi.fn().mockResolvedValue(undefined),
    handleSopDecision: vi.fn().mockResolvedValue(undefined),
  };
}

describe('SopController', () => {
  let sopService: ISopService;
  let app: ReturnType<typeof makeAppMock>['app'];
  let trigger: ReturnType<typeof makeAppMock>['trigger'];

  beforeEach(() => {
    sopService = makeSopServiceMock();
    ({ app, trigger } = makeAppMock());
    new SopController(sopService).register(app);
  });

  it('forwards a plain channel message to the sop service', async () => {
    await trigger('message', '*', {
      message: {
        type: 'message', subtype: undefined, channel_type: 'channel',
        user: 'U1', text: 'long detailed answer', channel: 'C1', ts: '111.1', event_ts: '111.1',
      },
    });

    expect(sopService.handleChannelMessage).toHaveBeenCalledWith('C1', 'U1', 'long detailed answer', '111.1');
  });

  it('ignores DMs', async () => {
    await trigger('message', '*', {
      message: { type: 'message', subtype: undefined, channel_type: 'im', user: 'U1', text: 'hi', channel: 'D1', ts: '1', event_ts: '1' },
    });

    expect(sopService.handleChannelMessage).not.toHaveBeenCalled();
  });

  it('ignores messages with a subtype (edits, joins, bot messages)', async () => {
    await trigger('message', '*', {
      message: {
        type: 'message', subtype: 'message_changed', channel_type: 'channel',
        channel: 'C1', ts: '1', event_ts: '1', hidden: true, message: {}, previous_message: {},
      },
    });

    expect(sopService.handleChannelMessage).not.toHaveBeenCalled();
  });

  it('ignores messages with no text', async () => {
    await trigger('message', '*', {
      message: { type: 'message', subtype: undefined, channel_type: 'channel', user: 'U1', channel: 'C1', ts: '1', event_ts: '1' },
    });

    expect(sopService.handleChannelMessage).not.toHaveBeenCalled();
  });

  it('fetches the total reaction count and forwards reaction_added events', async () => {
    const client = makeWebClientMock();
    vi.mocked(client.reactions.get).mockResolvedValue({
      ok: true,
      message: { reactions: [{ name: '+1', count: 2 }, { name: 'tada', count: 1 }] },
    } as never);

    await trigger('event', 'reaction_added', {
      event: { type: 'reaction_added', user: 'U2', reaction: '+1', item: { type: 'message', channel: 'C1', ts: '111.1' }, item_user: 'U1', event_ts: '999' },
      client,
    });

    expect(client.reactions.get).toHaveBeenCalledWith({ channel: 'C1', timestamp: '111.1' });
    expect(sopService.handleReactionAdded).toHaveBeenCalledWith('C1', '111.1', 3);
  });

  it('ignores reactions on non-message items', async () => {
    const client = makeWebClientMock();

    await trigger('event', 'reaction_added', {
      event: { type: 'reaction_added', user: 'U2', reaction: '+1', item: { type: 'file', file: 'F1' }, item_user: 'U1', event_ts: '999' },
      client,
    });

    expect(sopService.handleReactionAdded).not.toHaveBeenCalled();
    expect(client.reactions.get).not.toHaveBeenCalled();
  });

  it('acks and forwards an accepted SOP decision', async () => {
    const ack = makeAckFn();

    await trigger('action', SOP_ACCEPT_ACTION_ID, {
      ack,
      body: { channel: { id: 'C1' }, user: { id: 'U1' } },
      action: { action_id: SOP_ACCEPT_ACTION_ID, value: '111.1' },
    });

    expect(ack).toHaveBeenCalled();
    expect(sopService.handleSopDecision).toHaveBeenCalledWith('C1', '111.1', true);
  });

  it('acks and forwards a declined SOP decision', async () => {
    const ack = makeAckFn();

    await trigger('action', SOP_DECLINE_ACTION_ID, {
      ack,
      body: { channel: { id: 'C1' }, user: { id: 'U1' } },
      action: { action_id: SOP_DECLINE_ACTION_ID, value: '111.1' },
    });

    expect(ack).toHaveBeenCalled();
    expect(sopService.handleSopDecision).toHaveBeenCalledWith('C1', '111.1', false);
  });

  it('does nothing if the action body is missing channel or value', async () => {
    const ack = makeAckFn();

    await trigger('action', SOP_ACCEPT_ACTION_ID, {
      ack,
      body: { user: { id: 'U1' } },
      action: { action_id: SOP_ACCEPT_ACTION_ID },
    });

    expect(ack).toHaveBeenCalled();
    expect(sopService.handleSopDecision).not.toHaveBeenCalled();
  });
});
