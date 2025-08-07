import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import middy from "@middy/core";
import httpHeaderNormalizer from "@middy/http-header-normalizer";
import httpJsonBodyParser from "@middy/http-json-body-parser";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import pino from "pino";
import { S3FileStorageClient } from "./source/adapters/s3-file-storage.client";
import { DynSystemPromptsRepositoryImpl } from "./source/adapters/dyn-system-prompts.repository-impl";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { PromptRegulatoryComplianceCommandHandler } from "./source/domain/command-handlers/prompt-regulatory-compliance.command-handler";
import { BedrockAIChatClient } from "./source/adapters/bedrock-ai-chat.client";
import { PromptRegulatoryComplianceEntrypoint } from "./source/entrypoints/prompt-regulatory-compliance.entrypoint";

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

const logger = pino({});

const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const fileStorageClient = new S3FileStorageClient(
  new S3Client({}), 
  process.env.BUCKET_NAME!, 
  logger
);

const systemPromptsRepository = new DynSystemPromptsRepositoryImpl(
  dynamoDBDocumentClient,
  process.env.SYSTEM_PROMPTS_TABLE_NAME!,
  logger
);

const aiChatClient = new BedrockAIChatClient(
  new BedrockRuntimeClient({
    region: "us-east-1",
  }),
  process.env.BEDROCK_MODEL_ID!,
  logger
);

const promptRegulatoryComplianceCommandHandler = new PromptRegulatoryComplianceCommandHandler(
  fileStorageClient,
  systemPromptsRepository,
  aiChatClient,
  logger
);

const promptRegulatoryComplianceEntrypoint = new PromptRegulatoryComplianceEntrypoint(
  promptRegulatoryComplianceCommandHandler
);

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const body = event.body! as any;
  try {

    const result = await promptRegulatoryComplianceEntrypoint.handleRequest({
      question: body.question as string,
      recordKeys: body.recordKeys as string[]
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: {
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
      }
    };
  } catch (error) {
    // TODO: handle send error responses
    if (error instanceof Error) {
      logger.error({ err: error }, "Error in lambda handler");
    }
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error",
      }),
      headers: {
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
      }
    };
  }
};

export const handler = middy<
  APIGatewayProxyEvent, 
  APIGatewayProxyResult
>({ streamifyResponse: true })
  .use(httpHeaderNormalizer())
  .use(httpJsonBodyParser())
  .handler(lambdaHandler);
