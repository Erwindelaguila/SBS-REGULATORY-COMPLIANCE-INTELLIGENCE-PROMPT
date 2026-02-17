import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBStreamEvent } from "aws-lambda";
import { S3FileStorageClient } from "./adapters/s3-file-storage.client";
import { S3Client } from "@aws-sdk/client-s3";
import { DynSupervisoryRecordsRepository } from "./adapters/dyn-supervisory-records.repository";
import pino from "pino";

import { unmarshall } from "@aws-sdk/util-dynamodb";
import { ProcessDocumentsEntryPoint } from "./entrypoints/process-documents.entrypoint";
import { ProcessDocumentsCommandHandler } from "./domain/command-handlers/process-documents.command-handler";
import { KafkaProducerAdapter } from "./adapters/kafka-producer.adapter";
import { DynSupervisoryRecordMetadataRepository } from "./adapters/dyn-supervisory-record-metadata.repository";
import { BedrockAIChatClient } from "./adapters/bedrock-ai-chat.client";
import { DynSystemPromptsRepository } from "./adapters/dyn-system-prompts.repository";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { SQS } from "@aws-sdk/client-sqs";
import { SqsQueueClient } from "./adapters/sqs-queue.client";
import { DynamoDBSubordinatedDebtCriteriaRepository } from "./adapters/dynamodb-subordinated-debt-criteria.repository";
import { DynamoDBSubordinatedDebtAnalysisRepository } from "./adapters/dynamodb-subordinated-debt-analysis.repository";

const logger = pino({
  level: "debug",
});

const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const dynamoDBClient = new DynamoDBClient({});
const s3Client = new S3Client({});
const bedrockRuntimeClient = new BedrockRuntimeClient({});
const sqsClient = new SQS({});

const recordsFileStorageClient = new S3FileStorageClient(s3Client, process.env.S3_DOCUMENTS_BUCKET_NAME!, logger);
const processedRecordsFileStorageClient = new S3FileStorageClient(
  s3Client,
  process.env.S3_PROCESSED_DOCUMENTS_BUCKET_NAME!,
  logger,
);

const supervisoryRecordsRepository = new DynSupervisoryRecordsRepository(
  dynamoDBDocumentClient,
  process.env.SUPERVISORY_RECORDS_TABLE_NAME!,
  logger,
);

const supervisoryRecordMetadataRepository = new DynSupervisoryRecordMetadataRepository(
  dynamoDBDocumentClient,
  process.env.SUPERVISORY_RECORDS_METADATA_TABLE_NAME!,
  logger,
);

const systemPromptsRepository = new DynSystemPromptsRepository(
  dynamoDBDocumentClient,
  process.env.SYSTEM_PROMPTS_TABLE_NAME!,
  logger,
);

const eventProducerClient = new KafkaProducerAdapter(
  {
    brokers: process.env.KAFKA_BROKERS!.split(","),
    clientId: "process-documents-function",
  },
  logger,
);

const aiChatClient = new BedrockAIChatClient(
  bedrockRuntimeClient,
  process.env.BEDROCK_MODEL_ID!,
  logger,
  process.env.S3_DOCUMENTS_BUCKET_NAME!, // Bucket for Textract
);
const sqsQueueClient = new SqsQueueClient(sqsClient, process.env.INTERACTION_WEBSOCKET_QUEUE_URL!, logger);

const subordinatedDebtCriteriaRepository = new DynamoDBSubordinatedDebtCriteriaRepository(
  dynamoDBClient,
  process.env.SUBORDINATED_DEBT_CRITERIA_TABLE_NAME!,
  logger,
);

const subordinatedDebtAnalysisRepository = new DynamoDBSubordinatedDebtAnalysisRepository(
  dynamoDBClient,
  process.env.SUBORDINATED_DEBT_ANALYSIS_TABLE_NAME!,
  logger,
);

const processDocumentsCommandHandler = new ProcessDocumentsCommandHandler(
  recordsFileStorageClient,
  processedRecordsFileStorageClient,
  aiChatClient,
  sqsQueueClient,
  supervisoryRecordsRepository,
  systemPromptsRepository,
  supervisoryRecordMetadataRepository,
  eventProducerClient,
  subordinatedDebtCriteriaRepository,
  subordinatedDebtAnalysisRepository,
  logger,
);

const processDocumentsEntrypoint = new ProcessDocumentsEntryPoint(processDocumentsCommandHandler, logger);

export const handler = async (event: DynamoDBStreamEvent) => {
  const records = event.Records.filter(
    (record) => record.dynamodb !== undefined && record.dynamodb.NewImage !== undefined,
  ).map((records) => unmarshall(records.dynamodb!.NewImage as any));

  try {
    await processDocumentsEntrypoint.handleRequest({
      insertRecords: records,
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
