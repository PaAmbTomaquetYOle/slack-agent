import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAuthService, IInterviewService } from '../../../application';
import { DirectMessageController } from '../directMessageController';
import { makeAppMock } from '../../../testing/slackMocks';

function makeInterviewServiceMock(): IInterviewService {
  return { handleIncomingDirectMessage: vi.fn().mockResolvedValue(undefined) };
}

function makeAuthServiceMock(): IAuthService {
  return {
    initiateAuth: vi.fn().mockResolvedValue(undefined),
    handleAuthCodeMessage: vi.fn().mockResolvedValue(undefined),
    hasPendingAuth: vi.fn().mockReturnValue(false),
    isAuthErrorMessage: vi.fn().mockReturnValue(false),
  };
}

describe('DirectMessageController', () => {
  let authService: IAuthService;
  let interviewService: IInterviewService;
  let app: ReturnType<typeof makeAppMock>['app'];
  let trigger: ReturnType<typeof makeAppMock>['trigger'];

  beforeEach(() => {
    authService = makeAuthServiceMock();
    interviewService = makeInterviewServiceMock();
    ({ app, trigger } = makeAppMock());
    new DirectMessageController(authService, interviewService).register(app);
  });

  it('forwards a plain DM text message to the interview service when no auth is pending', async () => {
    await trigger('message', '*', {
      message: { type: 'message', subtype: undefined, channel_type: 'im', user: 'U-DEPARTING', text: 'Hi there', channel: 'D1', ts: '1', event_ts: '1' },
    });

    expect(interviewService.handleIncomingDirectMessage).toHaveBeenCalledWith('U-DEPARTING', 'Hi there');
    expect(authService.handleAuthCodeMessage).not.toHaveBeenCalled();
  });

  it('routes the message to auth handling when an auth request is pending for the user', async () => {
    (authService.hasPendingAuth as ReturnType<typeof vi.fn>).mockReturnValue(true);

    await trigger('message', '*', {
      message: { type: 'message', subtype: undefined, channel_type: 'im', user: 'U-DEPARTING', text: 'auth-code-123', channel: 'D1', ts: '1', event_ts: '1' },
    });

    expect(authService.handleAuthCodeMessage).toHaveBeenCalledWith('U-DEPARTING', 'auth-code-123');
    expect(interviewService.handleIncomingDirectMessage).not.toHaveBeenCalled();
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
