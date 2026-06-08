import { App } from '@slack/bolt';
import type { AppOptions } from '@slack/bolt';
import * as dotenv from 'dotenv';

dotenv.config();

const appOptions: AppOptions = {
  ...(process.env.SLACK_BOT_TOKEN ? { token: process.env.SLACK_BOT_TOKEN } : {}),
  ...(process.env.SLACK_SIGNING_SECRET ? { signingSecret: process.env.SLACK_SIGNING_SECRET } : {}),
  socketMode: true, // for local development
  ...(process.env.SLACK_APP_TOKEN ? { appToken: process.env.SLACK_APP_TOKEN } : {})
};

const app = new App(appOptions);

(async () => {
  await app.start(process.env.PORT ?? 3000);
  console.log('The Slack bot is up');
})();