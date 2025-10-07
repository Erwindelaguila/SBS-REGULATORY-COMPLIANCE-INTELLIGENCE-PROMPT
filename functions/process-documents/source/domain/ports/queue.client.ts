export type QueueMessage = {
  id: string;
  message: {
    sessionId: string;
    type: string;
    data: Record<string, any>;
  };
};

export interface QueueClient {
  sendMessages(queueMessages: QueueMessage[]): Promise<void>;
}