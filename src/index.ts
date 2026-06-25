import { AppFactory, SETTINGS } from './infrastructure';

const app = new AppFactory().createApp();

(async () => {
  await app.start(SETTINGS.PORT);
  console.log('The Slack bot is up and listening on port', SETTINGS.PORT);
})();