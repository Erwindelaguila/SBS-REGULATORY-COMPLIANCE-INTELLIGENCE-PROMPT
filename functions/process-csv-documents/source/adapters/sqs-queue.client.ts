import { SendMessageBatchCommand, SQS } from "@aws-sdk/client-sqs";
import { QueueClient, QueueMessage } from "../domain/ports/queue.client";
import { Logger } from "pino";

export class SqsQueueClient implements QueueClient {
  constructor(
    private readonly sqsClient: SQS,
    private readonly queueUrl: string,
    private readonly logger: Logger,
  ) {}

  async sendMessages(queueMessages: QueueMessage[]): Promise<void> {
    this.logger.debug({ queueMessages, queueUrl: this.queueUrl }, "Sending messages to SQS queue");

    const command = new SendMessageBatchCommand({
      QueueUrl: this.queueUrl,
      Entries: queueMessages.map((queueMessage) => ({
        Id: queueMessage.id,
        MessageBody: JSON.stringify(queueMessage.message),
      })),
    });

    await this.sqsClient.send(command);
    this.logger.debug("Messages sent to SQS queue");
  }
}
