import type { AppOptions } from '@slack/bolt';

import { SETTINGS } from '.';

export const APP_OPTIONS: AppOptions = {
  ...(SETTINGS.SLACK_BOT_TOKEN ? { token: SETTINGS.SLACK_BOT_TOKEN } : {}),
  ...(SETTINGS.SLACK_SIGNING_SECRET ? { signingSecret: SETTINGS.SLACK_SIGNING_SECRET } : {}),
  socketMode: true, // for local development
  ...(SETTINGS.SLACK_APP_TOKEN ? { appToken: SETTINGS.SLACK_APP_TOKEN } : {})
};