import type { App } from '@slack/bolt';
import { JIRA_AUTH_ACTION_ID, TRELLO_AUTH_ACTION_ID } from '../../application';
import { BaseController } from './baseController';

export class AuthActionController extends BaseController {
  register(app: App): void {
    app.action(JIRA_AUTH_ACTION_ID, async ({ ack }) => {
      await ack();
    });
    app.action(TRELLO_AUTH_ACTION_ID, async ({ ack }) => {
      await ack();
    });
  }
}
