import { AppFactory, SETTINGS } from './infrastructure';

(async () => {
  const { app, eventConsumer, orchestrator, sopService } = await new AppFactory().create();
  await app.start(SETTINGS.PORT);
  console.log('The Slack bot is up and listening on port', SETTINGS.PORT);
  await orchestrator.recover();
  await sopService.rehydrate();

  const shutdown = async (): Promise<void> => {
    if (eventConsumer) {
      await eventConsumer.stop();
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
})();