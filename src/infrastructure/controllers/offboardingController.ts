import type { App } from '@slack/bolt';
import type { IOffboardingService } from '../../application/serviceInterfaces';
import { BaseController } from './baseController';

const MODAL_CALLBACK_ID = 'offboarding_modal';
const USER_PICKER_ACTION_ID = 'departing_user_select';
const USER_PICKER_BLOCK_ID = 'departing_user_block';

export class OffboardingController extends BaseController {
  readonly #offboardingService: IOffboardingService;

  constructor(offboardingService: IOffboardingService) {
    super();
    this.#offboardingService = offboardingService;
  }

  register(app: App): void {
    app.command('/offboarding', async ({ ack, client, body }) => {
      await ack();
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: 'modal',
          callback_id: MODAL_CALLBACK_ID,
          title: { type: 'plain_text', text: 'Start Offboarding' },
          submit: { type: 'plain_text', text: 'Start' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks: [
            {
              type: 'input',
              block_id: USER_PICKER_BLOCK_ID,
              label: { type: 'plain_text', text: 'Departing volunteer' },
              element: {
                type: 'users_select',
                action_id: USER_PICKER_ACTION_ID,
                placeholder: { type: 'plain_text', text: 'Select a user' },
              },
            },
          ],
        },
      });
    });

    app.view(MODAL_CALLBACK_ID, async ({ ack, view, body }) => {
      await ack();
      const departingUserId =
        view.state.values[USER_PICKER_BLOCK_ID]?.[USER_PICKER_ACTION_ID]?.selected_user;
      if (!departingUserId) return;
      const initiatorId = body.user.id;
      try {
        await this.#offboardingService.startOffboarding(departingUserId, initiatorId);
      } catch (error) {
        console.error('Failed to start offboarding:', error);
      }
    });
  }
}
