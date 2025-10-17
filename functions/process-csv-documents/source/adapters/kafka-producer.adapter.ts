import { Kafka, Producer, ProducerRecord } from "kafkajs";
import { Logger } from "pino";
import { EventMessage, EventProducerClient } from "../domain/ports/event-producer.client";

export interface KafkaProducerConfig {
  brokers: string[];
  clientId: string;
}

export class KafkaProducerAdapter implements EventProducerClient {
  private kafka: Kafka;
  private producer: Producer;
  private connected: boolean = false;

  constructor(
    private readonly config: KafkaProducerConfig,
    private readonly logger: Logger,
  ) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
    });
    this.producer = this.kafka.producer();
  }

  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.info({ brokers: this.config.brokers }, "Connected to Kafka");
    } catch (error) {
      this.logger.error({ error, brokers: this.config.brokers }, "Failed to connect to Kafka");
      throw error;
    }
  }

  public async sendEvents(events: EventMessage[]): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const records: ProducerRecord[] = events.map((event) => ({
        topic: event.topic,
        messages: event.messages,
      }));

      await this.producer.sendBatch({
        topicMessages: records,
      });

      this.logger.info({ messages: events.length }, "Message sent to Kafka");
    } catch (error) {
      this.logger.error({ error, messages: events.length }, "Failed to send message to Kafka");
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        await this.producer.disconnect();
        this.connected = false;
        this.logger.info("Disconnected from Kafka");
      } catch (error) {
        this.logger.error({ error }, "Failed to disconnect from Kafka");
        throw error;
      }
    }
  }
}
