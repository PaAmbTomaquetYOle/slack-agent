import { createServer } from 'node:http';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT ?? '3000');
const SLACK_AGENT_DRY_RUN = process.env.SLACK_AGENT_DRY_RUN === 'true';

function startDryRunServer(): void {
  const server = createServer((request, response) => {
    const isHealthRequest = request.url === '/health';
    const statusCode = isHealthRequest ? 200 : 404;
    const payload = isHealthRequest
      ? {
          status: 'ok',
          mode: 'dry-run',
          message: 'Slack agent dry-run mode is active. Real Slack connectivity is disabled.',
        }
      : { status: 'not_found' };

    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  });

  server.listen(PORT, () => {
    console.log('Slack agent dry-run server is listening on port', PORT);
  });
}

(async () => {
  if (SLACK_AGENT_DRY_RUN) {
    startDryRunServer();
    return;
  }

  const [{ AppFactory }, { SETTINGS }] = await Promise.all([
    import('./infrastructure/appFactory.js'),
    import('./infrastructure/settings/constants.js'),
  ]);

  const { app, eventConsumer } = await new AppFactory().create();
  await app.start(SETTINGS.PORT);
  console.log('The Slack bot is up and listening on port', SETTINGS.PORT);
  await orchestrator.recover();

  const shutdown = async (): Promise<void> => {
    if (eventConsumer) {
      await eventConsumer.stop();
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
})();
