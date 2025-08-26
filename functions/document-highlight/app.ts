import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyHandler } from "aws-lambda";
import pino from "pino";
import { DynSupervisoryRecordsRepository } from "./source/adapters/dyn-supervisory-records.repository";
import { PdfProcessorAdapter } from "./source/adapters/pdf-processor.adapter";
import { S3FileStorageClient } from "./source/adapters/s3-file-storage.client";
import { HighlightPdfCommandHandler } from "./source/domain/command-handlers/highlight-pdf.command-handler";
import { HighlightPdfErrorCodes, HighlightPdfError } from "./source/domain/errors/highlight-pdf.error";
import { HighlightPdfEntryPoint } from "./source/entrypoints/highlight-pdf.entrypoint";

const logger = pino({
  level: "debug",
});

// Initialize AWS clients
const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

// Initialize adapters
const supervisoryRecordsRepository = new DynSupervisoryRecordsRepository(
  dynamoDBDocumentClient,
  process.env.SUPERVISORY_RECORDS_TABLE_NAME!,
  logger
);

const fileStorageClient = new S3FileStorageClient(
  s3Client,
  process.env.S3_DOCUMENTS_BUCKET_NAME!,
  logger
);

const pdfProcessor = new PdfProcessorAdapter(logger);

// Initialize command handler
const highlightPdfCommandHandler = new HighlightPdfCommandHandler(
  supervisoryRecordsRepository,
  fileStorageClient,
  pdfProcessor,
  logger
);

// Initialize entrypoint
const highlightPdfEntrypoint = new HighlightPdfEntryPoint(highlightPdfCommandHandler);

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const uuid = event.pathParameters?.uuid as string;
  
  // Parse request body for paragraph and page number
  let paragraph: string;
  let pageNumber: number;
  
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    paragraph = body.paragraph;
    pageNumber = body.pageNumber;
    
    if (!paragraph || !pageNumber) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "Missing required parameters: paragraph and pageNumber"
        }),
      };
    }
  } catch (parseError) {
    logger.error({ parseError }, "Error parsing request body");
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Invalid request body"
      }),
    };
  }

  try {
    const result = await highlightPdfEntrypoint.handleRequest({ 
      uuid, 
      paragraph, 
      pageNumber 
    });
    
    const base64Result = result.buffer.toString("base64");

    logger.debug({ downloadName: result.downloadName }, "PDF highlighted successfully");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.downloadName}"`,
        "Cache-Control": "no-store",
      },
      isBase64Encoded: true,
      body: base64Result,
    };
  } catch (error) {
    logger.error({ error, uuid, paragraph, pageNumber }, "Error processing highlight PDF request");
    
    if (error instanceof HighlightPdfError) {
      let statusCode = 500;
      
      switch (error.code) {
        case HighlightPdfErrorCodes.ERROR_HP_002: // Record not found
          statusCode = 404;
          break;
        case HighlightPdfErrorCodes.ERROR_HP_003: // PDF not found
          statusCode = 404;
          break;
        case HighlightPdfErrorCodes.ERROR_HP_004: // Invalid PDF
          statusCode = 422;
          break;
        case HighlightPdfErrorCodes.ERROR_HP_005: // Page not found
          statusCode = 400;
          break;
        case HighlightPdfErrorCodes.ERROR_HP_006: // Paragraph not found
          statusCode = 404;
          break;
        case HighlightPdfErrorCodes.ERROR_HP_007: // Processing error
          statusCode = 500;
          break;
        default:
          statusCode = 500;
      }
      
      return {
        statusCode,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: error.code,
          message: error.message,
        }),
      };
    }
    
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Internal server error"
      }),
    };
  }
};
