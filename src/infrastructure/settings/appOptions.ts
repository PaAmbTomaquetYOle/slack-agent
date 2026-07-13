import type { AppOptions } from '@slack/bolt';

import { SETTINGS } from './constants.js';

export const APP_OPTIONS: AppOptions = {
  ...(SETTINGS.SLACK_BOT_TOKEN ? { token: SETTINGS.SLACK_BOT_TOKEN } : {}),
  ...(SETTINGS.SLACK_SIGNING_SECRET ? { signingSecret: SETTINGS.SLACK_SIGNING_SECRET } : {}),
  socketMode: true, // for local development
  ...(SETTINGS.SLACK_APP_TOKEN ? { appToken: SETTINGS.SLACK_APP_TOKEN } : {}),
  // SA-9: the knowledge graph visualization's custom routes ride on the Socket Mode receiver's
  // built-in HTTP server, which listens on installerOptions.port (default 3000 otherwise).
  installerOptions: { port: Number(SETTINGS.PORT) },
};
