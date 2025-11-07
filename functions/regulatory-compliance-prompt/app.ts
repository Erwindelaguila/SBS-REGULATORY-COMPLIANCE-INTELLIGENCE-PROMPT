import dotenv from "dotenv";
dotenv.config();

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import pino from "pino";
import { BedrockAIChatClient } from "./source/adapters/bedrock-ai-chat.client";
import { DynSystemPromptsRepositoryImpl } from "./source/adapters/dyn-system-prompts.repository-impl";
import { S3FileStorageClient } from "./source/adapters/s3-file-storage.client";
import { PromptRegulatoryComplianceCommandHandler } from "./source/domain/command-handlers/prompt-regulatory-compliance.command-handler";
import { PromptRegulatoryComplianceEntrypoint } from "./source/entrypoints/prompt-regulatory-compliance.entrypoint";
import { DynSourceProcessRepositoryImpl } from "./source/adapters/dyn-source-process.repository-impl";

/**
 * DI Container - Dependency Injection Container
 * Initializes and exports all services, clients, and repositories
 */

export const logger = pino({
  level: "debug",
});

// Uso general - AI Chat Client
export const aiChatClient = new BedrockAIChatClient(
  new BedrockRuntimeClient({
    region: "us-east-1",
  }),
  process.env.BEDROCK_MODEL_ID!,
  logger
);

export const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const systemPromptsRepository = new DynSystemPromptsRepositoryImpl(
  dynamoDBDocumentClient,
  process.env.SYSTEM_PROMPTS_TABLE_NAME!,
  logger
);

// Carga documental
export const documentsFileStorageClient = new S3FileStorageClient(
  new S3Client({}),
  process.env.S3_DOCUMENTS_BUCKET_NAME!,
  logger
);

export const csvFileStorageClient = new S3FileStorageClient(
  new S3Client({}),
  process.env.S3_CSV_BUCKET_NAME!,
  logger
);

// Carta fianza
export const documentsFileStorageClientForLetterAnalysis = new S3FileStorageClient(
  new S3Client({}),
  process.env.S3_LETTER_REPORTS_BUCKET_NAME!,
  logger
);

export const sourceProcessLetterRepository = new DynSourceProcessRepositoryImpl(
  dynamoDBDocumentClient,
  process.env.LETTER_ANALYSIS_TABLE_NAME!,
  logger
);

// Garantías preferenciales
export const documentsFileStorageClientForWarrantyAnalysis = new S3FileStorageClient(
  new S3Client({}),
  process.env.S3_WARRANTY_REPORTS_BUCKET_NAME!,
  logger
);

export const sourceProcessWarrantyRepository = new DynSourceProcessRepositoryImpl(
  dynamoDBDocumentClient,
  process.env.WARRANTY_ANALYSIS_TABLE_NAME!,
  logger
);

// Command Handler
export const promptRegulatoryComplianceCommandHandler = new PromptRegulatoryComplianceCommandHandler(
  documentsFileStorageClient,
  documentsFileStorageClientForLetterAnalysis,
  documentsFileStorageClientForWarrantyAnalysis,
  csvFileStorageClient,
  systemPromptsRepository,
  sourceProcessLetterRepository,
  sourceProcessWarrantyRepository,
  aiChatClient,
  process.env.SAVE_CSV_FLAG === "true",
  logger
);

// Entrypoint
export const promptRegulatoryComplianceEntrypoint = new PromptRegulatoryComplianceEntrypoint(
  promptRegulatoryComplianceCommandHandler
);
