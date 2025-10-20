import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { Context, LambdaFunctionURLEvent } from "aws-lambda";
import pino from "pino";
import { BedrockAIChatClient } from "./source/adapters/bedrock-ai-chat.client";
import { DynSystemPromptsRepositoryImpl } from "./source/adapters/dyn-system-prompts.repository-impl";
import { S3FileStorageClient } from "./source/adapters/s3-file-storage.client";
import { PromptRegulatoryComplianceCommandHandler } from "./source/domain/command-handlers/prompt-regulatory-compliance.command-handler";
import { PromptRegulatoryComplianceEntrypoint } from "./source/entrypoints/prompt-regulatory-compliance.entrypoint";
import {DynSourceProcessRepositoryImpl} from "./source/adapters/dyn-source-process.repository-impl";

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

const logger = pino({
  level: "debug",
});

// Uso general
const aiChatClient = new BedrockAIChatClient(
    new BedrockRuntimeClient({
        region: "us-east-1",
    }),
    process.env.BEDROCK_MODEL_ID!,
    logger,
);
const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const systemPromptsRepository = new DynSystemPromptsRepositoryImpl(
    dynamoDBDocumentClient,
    process.env.SYSTEM_PROMPTS_TABLE_NAME!,
    logger,
);

// Carga documental

const documentsFileStorageClient = new S3FileStorageClient(
  new S3Client({}),
  process.env.S3_DOCUMENTS_BUCKET_NAME!,
  logger,
);
const csvFileStorageClient = new S3FileStorageClient(new S3Client({}), process.env.S3_CSV_BUCKET_NAME!, logger);





// Carta fianza
const documentsFileStorageClientForLetterAnalysis = new S3FileStorageClient(
    new S3Client({}),
    process.env.S3_LETTER_REPORTS_BUCKET_NAME!,
    logger,
);
const sourceProcessLetterRepository=new DynSourceProcessRepositoryImpl(
    dynamoDBDocumentClient,
    process.env.LETTER_ANALYSIS_TABLE_NAME!,
    logger,
)

const promptRegulatoryComplianceCommandHandler = new PromptRegulatoryComplianceCommandHandler(
  documentsFileStorageClient,
  documentsFileStorageClientForLetterAnalysis,
  csvFileStorageClient,
  systemPromptsRepository,
    sourceProcessLetterRepository,
  aiChatClient,
  process.env.SAVE_CSV_FLAG === "true",
  logger,
);

const promptRegulatoryComplianceEntrypoint = new PromptRegulatoryComplianceEntrypoint(
  promptRegulatoryComplianceCommandHandler,
);

export const handler = awslambda.streamifyResponse(
  async (event: LambdaFunctionURLEvent, responseStream: awslambda.HttpResponseStream, _: Context) => {
    const body = JSON.parse(event.body!) as any;
    logger.debug({ body }, "Body");

    try {
      const messageId = (body.sessionId as string).split(":")[1];
      const promptRegComplOutput = await promptRegulatoryComplianceEntrypoint.handleRequest({
        messageId, //SessionId
        application: body.application as string,// LETTER. WARRANTY. DOCUMENT_LOAD
        question: body.question as string,//USer input
        recordKeys: body.recordKeys as string[],//DOCUMENT LOAD
      });

      let fullResponse = "";

      for await (const chunk of promptRegComplOutput.result) {
        // logger.debug({ chunk }, "Chunk");
        fullResponse += chunk;
        responseStream.write(chunk);
      }

      logger.debug("Finish writing response");
      responseStream.end();

      logger.debug({ fullResponse }, "Full response");
    } catch (error) {
      // TODO: handle send error responses
      if (error instanceof Error) {
        logger.error({ err: error }, "Error in lambda handler");
      }
    }
  },
);
