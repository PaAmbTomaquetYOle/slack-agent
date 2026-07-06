export interface IDeadLetterQueue {
  send(rawValue: Buffer, sourceTopic: string, error: Error): Promise<void>;
}
