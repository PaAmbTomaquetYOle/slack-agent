import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IOffboardingService } from '../../../application';
import { OffboardingController } from '../offboardingController';
import { makeAppMock, makeAckFn, makeWebClientMock, type WebClientMock } from '../../../testing/slackMocks';

function makeOffboardingServiceMock(): IOffboardingService {
  return { startOffboarding: vi.fn() };
}

describe('OffboardingController', () => {
  let offboardingService: IOffboardingService;
  let controller: OffboardingController;
  let app: ReturnType<typeof makeAppMock>['app'];
  let trigger: ReturnType<typeof makeAppMock>['trigger'];
  let client: WebClientMock;

  beforeEach(() => {
    offboardingService = makeOffboardingServiceMock();
    controller = new OffboardingController(offboardingService);
    ({ app, trigger } = makeAppMock());
    client = makeWebClientMock();
    controller.register(app);
  });

  it('/offboarding opens the departing-volunteer modal', async () => {
    const ack = makeAckFn();
    await trigger('command', '/offboarding', { ack, client, body: { trigger_id: 'T1' } });

    expect(ack).toHaveBeenCalled();
    expect(client.views.open).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_id: 'T1',
        view: expect.objectContaining({ callback_id: 'offboarding_modal' }),
      }),
    );
  });

  function makeViewSubmitArgs(selectedUser: string | undefined) {
    const ack = makeAckFn();
    const view = {
      state: {
        values: {
          departing_user_block: { departing_user_select: { selected_user: selectedUser } },
        },
      },
    };
    const body = { user: { id: 'U-INITIATOR' } };
    return { ack, view, body, client };
  }

  it('view submission starts offboarding with the selected user and initiator', async () => {
    vi.mocked(offboardingService.startOffboarding).mockResolvedValue({} as never);

    await trigger('view', 'offboarding_modal', makeViewSubmitArgs('U-DEPARTING'));

    expect(offboardingService.startOffboarding).toHaveBeenCalledWith('U-DEPARTING', 'U-INITIATOR');
  });

  it('view submission without a selected user does not call the service', async () => {
    await trigger('view', 'offboarding_modal', makeViewSubmitArgs(undefined));

    expect(offboardingService.startOffboarding).not.toHaveBeenCalled();
  });

  it('view submission reports failure via an ephemeral message when the service throws', async () => {
    vi.mocked(offboardingService.startOffboarding).mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await trigger('view', 'offboarding_modal', makeViewSubmitArgs('U-DEPARTING'));

    expect(client.chat.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'U-INITIATOR',
        user: 'U-INITIATOR',
        text: expect.stringContaining('Failed to start the offboarding process'),
      }),
    );
    errorSpy.mockRestore();
  });
});
