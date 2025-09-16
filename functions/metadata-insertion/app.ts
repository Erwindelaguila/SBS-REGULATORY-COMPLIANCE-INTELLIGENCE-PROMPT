import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBStreamEvent } from "aws-lambda";
import { S3FileStorageClient } from "./source/adapters/s3-file-storage.client";
import { S3Client } from "@aws-sdk/client-s3";
import { DynSupervisoryRecordsRepository } from "./source/adapters/dyn-supervisory-records.repository";
import pino from "pino";
import { BedrockAIChatClient } from "./source/adapters/bedrock-ai-chat.client";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { MetadataInsertionPromptCommandHandler } from "./source/domain/command-handlers/metadata-insertion-prompt.command-handler";
import { MetadataInsertionPromptEntryPoint } from "./source/entrypoints/metadata-insertion-prompt.entrypoint";
import { SqsQueueClient } from "./source/adapters/sqs-queue.client";
import { SQS } from "@aws-sdk/client-sqs";
import { DynSystemPromptsRepository } from "./source/adapters/dyn-system-prompts.repository";

const logger = pino({
  level: "debug",
});

const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const fileStorageClient = new S3FileStorageClient(new S3Client({}), process.env.S3_DOCUMENTS_BUCKET_NAME!, logger);
const queueClient = new SqsQueueClient(new SQS({}), process.env.INTERACTION_WEBSOCKET_QUEUE_URL!, logger);

const supervisoryRecordsRepository = new DynSupervisoryRecordsRepository(
  dynamoDBDocumentClient,
  process.env.SUPERVISORY_RECORDS_TABLE_NAME!,
  logger,
);

const systemPromptsRepository = new DynSystemPromptsRepository(
  dynamoDBDocumentClient,
  process.env.SYSTEM_PROMPTS_TABLE_NAME as string,
  logger,
);

const aiChatClient = new BedrockAIChatClient(
  new BedrockRuntimeClient({
    region: "us-east-1",
  }),
  process.env.BEDROCK_MODEL_ID!,
  logger,
);

const metadataInsertionPromptCommandHandler = new MetadataInsertionPromptCommandHandler(
  aiChatClient,
  fileStorageClient,
  queueClient,
  systemPromptsRepository,
  supervisoryRecordsRepository,
  logger,
);

const metadataInsertionPromptEntrypoint = new MetadataInsertionPromptEntryPoint(metadataInsertionPromptCommandHandler);

export const handler = async (event: DynamoDBStreamEvent) => {
  try {
    await metadataInsertionPromptEntrypoint.handleRequest({
      insertRecords: event.Records,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Metadata Insertion Prompt Function",
      }),
    };
  } catch (error) {
    console.error("Error in Metadata Insertion Prompt Function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
