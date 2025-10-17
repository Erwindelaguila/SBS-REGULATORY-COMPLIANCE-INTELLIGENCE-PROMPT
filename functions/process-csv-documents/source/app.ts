import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBStreamEvent } from "aws-lambda";
import { S3FileStorageClient } from "./adapters/s3-file-storage.client";
import { S3Client } from "@aws-sdk/client-s3";
import pino from "pino";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { ProcessCsvDocumentsEntryPoint } from "./entrypoints/process-csv-documents.entrypoint";
import { ProcessCsvDocumentsCommandHandler } from "./domain/command-handlers/process-csv-documents.command-handler";
import { KafkaProducerAdapter } from "./adapters/kafka-producer.adapter";
import { SQS } from "@aws-sdk/client-sqs";
import { SqsQueueClient } from "./adapters/sqs-queue.client";
import { DynTableRepository } from "./adapters/dyn-table.repository";

const logger = pino({
  level: "debug",
});

const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});
const sqsClient = new SQS({});

const fileStorageClient = new S3FileStorageClient(s3Client, process.env.S3_DOCUMENTS_BUCKET_NAME!, logger);

const warrantyRRRepository = new DynTableRepository(
  dynamoDBDocumentClient,
  process.env.WARRANTY_RR_TABLE!,
  logger,
);

const warrantyITRepository = new DynTableRepository(
  dynamoDBDocumentClient,
  process.env.WARRANTY_IT_TABLE!,
  logger,
);

const letterRRRepository = new DynTableRepository(
  dynamoDBDocumentClient,
  process.env.LETTER_RR_TABLE!,
  logger,
);

const letterITRepository = new DynTableRepository(
  dynamoDBDocumentClient,
  process.env.LETTER_IT_TABLE!,
  logger,
);

const eventProducerClient = new KafkaProducerAdapter(
  {
    brokers: process.env.KAFKA_BROKERS!.split(","),
    clientId: "process-csv-documents-function",
  },
  logger,
);

const sqsQueueClient = new SqsQueueClient(sqsClient, process.env.INTERACTION_WEBSOCKET_QUEUE_URL!, logger);

const processCsvDocumentsCommandHandler = new ProcessCsvDocumentsCommandHandler(
  fileStorageClient,
  warrantyRRRepository,
  warrantyITRepository,
  letterRRRepository,
  letterITRepository,
  eventProducerClient,
  sqsQueueClient,
  logger,
);

const processCsvDocumentsEntrypoint = new ProcessCsvDocumentsEntryPoint(processCsvDocumentsCommandHandler, logger);

export const handler = async (event: DynamoDBStreamEvent) => {
  const records = event.Records.filter(
    (record) => record.dynamodb !== undefined && record.dynamodb.NewImage !== undefined,
  ).map((records) => unmarshall(records.dynamodb!.NewImage as any));

  try {
    await processCsvDocumentsEntrypoint.handleRequest({
      insertRecords: records,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Process CSV Documents Function",
      }),
    };
  } catch (error) {
    console.error("Error in Process CSV Documents Function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
