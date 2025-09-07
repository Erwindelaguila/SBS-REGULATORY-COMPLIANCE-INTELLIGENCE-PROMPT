import { S3Client } from "@aws-sdk/client-s3";

import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import pino from "pino";
import pinoPretty from "pino-pretty";

import { PdfProcessorAdapter } from "./source/adapters/pdf-processor.adapter";
import { S3FileStorageClient } from "./source/adapters/s3-file-storage.client";
import { HighlightPdfCommandHandler } from "./source/domain/command-handlers/highlight-pdf.command-handler";
import { HighlightPdfError, HighlightPdfErrorCodes } from "./source/domain/errors/highlight-pdf.error";
import { HighlightPdfEntryPoint } from "./source/entrypoints/highlight-pdf.entrypoint";

const pinoPrettyStream = pinoPretty({
  colorize: true,
  singleLine: true,
});

const logger = pino(
  {
    level: "debug",
  },
  pinoPrettyStream,
);

const s3Client = new S3Client({});

const csvAnalysisFileStorageClient = new S3FileStorageClient(
  s3Client,
  process.env.S3_CSV_ANALYSIS_BUCKET_NAME!,
  logger,
);
const recordsFileStorageClient = new S3FileStorageClient(s3Client, process.env.S3_RECORDS_BUCKET_NAME!, logger);

const pdfProcessor = new PdfProcessorAdapter(logger);

// Initialize command handler
const highlightPdfCommandHandler = new HighlightPdfCommandHandler(
  csvAnalysisFileStorageClient,
  recordsFileStorageClient,
  pdfProcessor,
  logger,
);

// Initialize entrypoint
const highlightPdfEntrypoint = new HighlightPdfEntryPoint(highlightPdfCommandHandler);

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const index = event.queryStringParameters?.index ? Number.parseInt(event.queryStringParameters?.index) : 0;
  const messageId = event.pathParameters?.messageId;
  let recordKey = event.pathParameters?.recordKey;

  if (!(messageId && recordKey)) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
      },
      body: JSON.stringify({
        error: "Missing required parameters: messageId and recordK",
      }),
    };
  }

  recordKey = decodeURIComponent(recordKey);

  try {
    const result = await highlightPdfEntrypoint.handleRequest({
      messageId,
      recordKey,
      index,
    });

    const base64Result = result.buffer.toString("base64");

    logger.debug({ downloadName: result.downloadName }, "PDF highlighted successfully");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.downloadName}"`,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
      },
      isBase64Encoded: true,
      body: base64Result,
    };
  } catch (error) {
    logger.error({ error }, "Error processing highlight PDF request");

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
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "*",
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
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
      },
      body: JSON.stringify({
        error: "Internal server error",
      }),
    };
  }
};
