import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ISopService } from '../../../application/index.js';
import { SOP_ACCEPT_ACTION_ID, SOP_DECLINE_ACTION_ID } from '../../../application/index.js';
import { SopController } from '../sopController.js';
import { makeAppMock, makeWebClientMock, makeAckFn } from '../../../testing/slackMocks.js';

function makeSopServiceMock(): ISopService {
  return {
    isMonitoredChannel: vi.fn().mockReturnValue(true),
    handleChannelMessage: vi.fn().mockResolvedValue(undefined),
    handleReactionAdded: vi.fn().mockResolvedValue(undefined),
    handleSopDecision: vi.fn().mockResolvedValue(undefined),
    deriveSopTitle: vi.fn().mockReturnValue('Derived default title'),
    rehydrate: vi.fn().mockResolvedValue(undefined),
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

  it('does not call the Slack API for reactions in unmonitored channels', async () => {
    vi.mocked(sopService.isMonitoredChannel).mockReturnValue(false);
    const client = makeWebClientMock();

    await trigger('event', 'reaction_added', {
      event: { type: 'reaction_added', user: 'U2', reaction: '+1', item: { type: 'message', channel: 'C-other', ts: '111.1' }, item_user: 'U1', event_ts: '999' },
      client,
    });

    expect(client.reactions.get).not.toHaveBeenCalled();
    expect(sopService.handleReactionAdded).not.toHaveBeenCalled();
  });

  it('acks and opens the title modal, prefilled with the derived default', async () => {
    const ack = makeAckFn();
    const client = makeWebClientMock();

    await trigger('action', SOP_ACCEPT_ACTION_ID, {
      ack,
      body: { channel: { id: 'C1' }, user: { id: 'U1' }, trigger_id: 'T1' },
      action: { action_id: SOP_ACCEPT_ACTION_ID, value: '111.1' },
      client,
    });

    expect(ack).toHaveBeenCalled();
    expect(sopService.deriveSopTitle).toHaveBeenCalledWith('C1', '111.1');
    expect(sopService.handleSopDecision).not.toHaveBeenCalled();
    expect(client.views.open).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_id: 'T1',
        view: expect.objectContaining({
          callback_id: 'sop_title_modal',
          private_metadata: JSON.stringify({ channelId: 'C1', messageTs: '111.1' }),
        }),
      }),
    );
  });

  it('does not open a modal when the candidate is no longer tracked', async () => {
    vi.mocked(sopService.deriveSopTitle).mockReturnValue(null);
    const ack = makeAckFn();
    const client = makeWebClientMock();

    await trigger('action', SOP_ACCEPT_ACTION_ID, {
      ack,
      body: { channel: { id: 'C1' }, user: { id: 'U1' }, trigger_id: 'T1' },
      action: { action_id: SOP_ACCEPT_ACTION_ID, value: '111.1' },
      client,
    });

    expect(client.views.open).not.toHaveBeenCalled();
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

  it('does nothing if the accept action body is missing channel, value, or trigger_id', async () => {
    const ack = makeAckFn();
    const client = makeWebClientMock();

    await trigger('action', SOP_ACCEPT_ACTION_ID, {
      ack,
      body: { user: { id: 'U1' } },
      action: { action_id: SOP_ACCEPT_ACTION_ID },
      client,
    });

    expect(ack).toHaveBeenCalled();
    expect(client.views.open).not.toHaveBeenCalled();
  });

  it('does nothing if the decline action body is missing channel or value', async () => {
    const ack = makeAckFn();

    await trigger('action', SOP_DECLINE_ACTION_ID, {
      ack,
      body: { user: { id: 'U1' } },
      action: { action_id: SOP_DECLINE_ACTION_ID },
    });

    expect(ack).toHaveBeenCalled();
    expect(sopService.handleSopDecision).not.toHaveBeenCalled();
  });

  describe('title modal submission', () => {
    function makeViewSubmitArgs(title: string | undefined, metadata = { channelId: 'C1', messageTs: '111.1' }) {
      const ack = makeAckFn();
      const view = {
        private_metadata: JSON.stringify(metadata),
        state: {
          values: {
            sop_title_block: { sop_title_input: { value: title } },
          },
        },
      };
      return { ack, view };
    }

    it('forwards the accepted decision with the author-entered title', async () => {
      await trigger('view', 'sop_title_modal', makeViewSubmitArgs('My chosen title'));

      expect(sopService.handleSopDecision).toHaveBeenCalledWith('C1', '111.1', true, 'My chosen title');
    });

    it('trims the entered title', async () => {
      await trigger('view', 'sop_title_modal', makeViewSubmitArgs('  spaced title  '));

      expect(sopService.handleSopDecision).toHaveBeenCalledWith('C1', '111.1', true, 'spaced title');
    });

    it('does nothing when the title is blank', async () => {
      await trigger('view', 'sop_title_modal', makeViewSubmitArgs('   '));

      expect(sopService.handleSopDecision).not.toHaveBeenCalled();
    });

    it('does nothing when private_metadata is malformed', async () => {
      const ack = makeAckFn();
      const view = {
        private_metadata: 'not-json',
        state: { values: { sop_title_block: { sop_title_input: { value: 'Title' } } } },
      };

      await trigger('view', 'sop_title_modal', { ack, view });

      expect(sopService.handleSopDecision).not.toHaveBeenCalled();
    });
  });
});
