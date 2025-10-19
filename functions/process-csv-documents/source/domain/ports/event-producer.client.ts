export interface EventMessage {
  topic: string;
  messages: Array<{
    key?: string;
    value: string;
    headers?: Record<string, string>;
  }>;
}

export interface EventProducerClient {
  sendEvents(events: EventMessage[]): Promise<void>;
}
