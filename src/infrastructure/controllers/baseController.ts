import type { App } from '@slack/bolt';

export abstract class BaseController {
  abstract register(app: App): void;
}
