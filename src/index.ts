import { App } from '@slack/bolt';
import { APP_OPTIONS, SETTINGS } from './infrastructure';

const app = new App(APP_OPTIONS);

(async () => {
  await app.start(SETTINGS.PORT);
  console.log('The Slack bot is up and listening on port', SETTINGS.PORT);
})();