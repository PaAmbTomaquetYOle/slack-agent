import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IQuestionSuggestionService } from '../../../application/serviceInterfaces';
import { QuestionSuggestionController } from '../questionSuggestionController';
import { makeAppMock } from '../../../testing/slackMocks';

function makeQuestionSuggestionServiceMock(): IQuestionSuggestionService {
  return { handleChannelMessage: vi.fn().mockResolvedValue(undefined) };
}

describe('QuestionSuggestionController', () => {
  let service: IQuestionSuggestionService;
  let app: ReturnType<typeof makeAppMock>['app'];
  let trigger: ReturnType<typeof makeAppMock>['trigger'];

  beforeEach(() => {
    service = makeQuestionSuggestionServiceMock();
    ({ app, trigger } = makeAppMock());
    new QuestionSuggestionController(service).register(app);
  });

  it('forwards a plain channel message to the question suggestion service', async () => {
    await trigger('message', '*', {
      message: {
        type: 'message', subtype: undefined, channel_type: 'channel',
        user: 'U1', text: 'how do I deploy this?', channel: 'C1', ts: '111.1', event_ts: '111.1',
      },
    });

    expect(service.handleChannelMessage).toHaveBeenCalledWith('C1', 'U1', 'how do I deploy this?');
  });

  it('ignores DMs', async () => {
    await trigger('message', '*', {
      message: { type: 'message', subtype: undefined, channel_type: 'im', user: 'U1', text: 'how do I do this?', channel: 'D1', ts: '1', event_ts: '1' },
    });

    expect(service.handleChannelMessage).not.toHaveBeenCalled();
  });

  it('ignores messages with a subtype (edits, joins, bot messages)', async () => {
    await trigger('message', '*', {
      message: {
        type: 'message', subtype: 'message_changed', channel_type: 'channel',
        channel: 'C1', ts: '1', event_ts: '1', hidden: true, message: {}, previous_message: {},
      },
    });

    expect(service.handleChannelMessage).not.toHaveBeenCalled();
  });

  it('ignores messages with no text', async () => {
    await trigger('message', '*', {
      message: { type: 'message', subtype: undefined, channel_type: 'channel', user: 'U1', channel: 'C1', ts: '1', event_ts: '1' },
    });

    expect(service.handleChannelMessage).not.toHaveBeenCalled();
  });
});
