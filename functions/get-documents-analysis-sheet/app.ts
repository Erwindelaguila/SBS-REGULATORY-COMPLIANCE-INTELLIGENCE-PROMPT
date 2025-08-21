import { S3Client } from "@aws-sdk/client-s3";
import { APIGatewayProxyEvent, APIGatewayProxyHandler } from "aws-lambda";
import pino from "pino";
import { S3FileStorageClient } from "./source/adapters/s3-file-storage.client";
import { GetAnalysisSheetCommandHandler } from "./source/domain/command-handlers/get-analysis-sheet.command-handler";
import { ErrorCodes } from "./source/domain/errors/error-codes";
import { GetAnalysisSheetError } from "./source/domain/errors/get-analysis-sheet.error";
import { GetAnalysisSheetEntryPoint } from "./source/entrypoints/get-analysis-sheet.entrypoint";

const logger = pino({
  level: "debug",
});

const fileStorageClient = new S3FileStorageClient(new S3Client({}), process.env.S3_CSV_BUCKET_NAME!, logger);
const getAnalysisSheetCommandHandler = new GetAnalysisSheetCommandHandler(fileStorageClient, logger);
const getAnalysisSheetEntrypoint = new GetAnalysisSheetEntryPoint(getAnalysisSheetCommandHandler);

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const uuid = event.pathParameters?.uuid as string;

  try {
    const result = await getAnalysisSheetEntrypoint.handleRequest({ uuid });
    const base64Result = result.buffer.toString("base64");

    logger.debug({ base64Result }, "Base64 result");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${result.downloadName}"`,
        "Cache-Control": "no-store",
      },
      isBase64Encoded: true,
      body: base64Result,
    };
  } catch (error) {
    logger.error({ error, uuid }, "Error processing get analysis sheet request");
    if (error instanceof GetAnalysisSheetError) {
      let statusCode = 500;
      if (error.code === ErrorCodes.ERROR_DA_GE_001) {
        statusCode = 500;
      } else if (error.code === ErrorCodes.ERROR_DA_GE_002) {
        statusCode = 422;
      } else if (error.code === ErrorCodes.ERROR_DA_GE_003) {
        statusCode = 404; // Unprocessable Entity
      }
      return {
        statusCode,
        body: JSON.stringify({
          code: error.code,
          message: error.message,
        }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({}),
    };
  }
};
