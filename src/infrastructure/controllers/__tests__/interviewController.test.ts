import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IInterviewService } from '../../../application';
import { InterviewController } from '../interviewController';
import { makeAppMock } from '../../../testing/slackMocks';

function makeInterviewServiceMock(): IInterviewService {
  return { handleIncomingDirectMessage: vi.fn().mockResolvedValue(undefined) };
}

describe('InterviewController', () => {
  let interviewService: IInterviewService;
  let app: ReturnType<typeof makeAppMock>['app'];
  let trigger: ReturnType<typeof makeAppMock>['trigger'];

  beforeEach(() => {
    interviewService = makeInterviewServiceMock();
    ({ app, trigger } = makeAppMock());
    new InterviewController(interviewService).register(app);
  });

  it('forwards a plain DM text message to the interview service', async () => {
    await trigger('message', '*', {
      message: { type: 'message', subtype: undefined, channel_type: 'im', user: 'U-DEPARTING', text: 'Hi there', channel: 'D1', ts: '1', event_ts: '1' },
    });

    expect(interviewService.handleIncomingDirectMessage).toHaveBeenCalledWith('U-DEPARTING', 'Hi there');
  });

  it('ignores messages in non-DM channels', async () => {
    await trigger('message', '*', {
      message: { type: 'message', subtype: undefined, channel_type: 'channel', user: 'U1', text: 'hi', channel: 'C1', ts: '1', event_ts: '1' },
    });

    expect(interviewService.handleIncomingDirectMessage).not.toHaveBeenCalled();
  });

  it('ignores messages with a subtype (edits, joins, bot messages)', async () => {
    await trigger('message', '*', {
      message: { type: 'message', subtype: 'message_changed', channel_type: 'im', channel: 'D1', ts: '1', event_ts: '1', hidden: true, message: {}, previous_message: {} },
    });

    expect(interviewService.handleIncomingDirectMessage).not.toHaveBeenCalled();
  });

  it('ignores DMs with no text', async () => {
    await trigger('message', '*', {
      message: { type: 'message', subtype: undefined, channel_type: 'im', user: 'U-DEPARTING', channel: 'D1', ts: '1', event_ts: '1' },
    });

    expect(interviewService.handleIncomingDirectMessage).not.toHaveBeenCalled();
  });
});
