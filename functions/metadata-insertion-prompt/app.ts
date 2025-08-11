import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBStreamEvent } from 'aws-lambda';
import { S3FileStorageClient } from './source/adapters/s3-file-storage.client';
import { S3Client } from '@aws-sdk/client-s3';
import { DynSupervisoryRecordsRepository } from './source/adapters/dyn-supervisory-records.repository';
import pino from 'pino';
import { BedrockAIChatClient } from './source/adapters/bedrock-ai-chat.client';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { MetadataInsertionPromptCommandHandler } from './source/domain/command-handlers/metadata-insertion-prompt.command-handler';
import { MetadataInsertionPromptEntryPoint } from './source/entrypoints/metadata-insertion-prompt.entrypoint';

const logger = pino({});

const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const fileStorageClient = new S3FileStorageClient(new S3Client({}), process.env.S3_BUCKET_NAME!, logger);

const supervisoryRecordsRepository = new DynSupervisoryRecordsRepository(
  dynamoDBDocumentClient,
  process.env.SUPERVISORY_RECORDS_TABLE_NAME!,
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
  supervisoryRecordsRepository,
  logger,
);

const metadataInsertionPromptEntrypoint = new MetadataInsertionPromptEntryPoint(
  metadataInsertionPromptCommandHandler,
);

const SYSTEM_PROMPT = 'You are a helpful assistant.';

const USER_PROMPT = 'Please provide the necessary metadata.';

export const handler = async (event: DynamoDBStreamEvent) => {
  try {
    await metadataInsertionPromptEntrypoint.handleRequest({
      insertRecords: event.Records,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: USER_PROMPT,
    });

    return { 
      statusCode: 200, 
      body: JSON.stringify({
        message: 'Metadata Insertion Prompt Function',
      })
    };
    
  } catch (error) {
    console.error('Error in Metadata Insertion Prompt Function:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({
        message: 'Internal Server Error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};