export interface IEventConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}
