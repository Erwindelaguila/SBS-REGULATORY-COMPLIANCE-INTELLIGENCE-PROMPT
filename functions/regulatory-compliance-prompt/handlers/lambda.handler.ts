import { Context, LambdaFunctionURLEvent } from "aws-lambda";
import { logger, promptRegulatoryComplianceEntrypoint } from "../app";

/**
 * AWS Lambda Handler
 * 
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 */
export const handler = awslambda.streamifyResponse(
  async (event: LambdaFunctionURLEvent, responseStream: awslambda.HttpResponseStream, _: Context) => {
    const body = JSON.parse(event.body!) as any;
    logger.debug({ body }, "Body");

    try {
      const messageId = (body.sessionId as string).split(":")[1];
      const promptRegComplOutput = await promptRegulatoryComplianceEntrypoint.handleRequest({
        messageId, // SessionId
        application: body.application as string, // LETTER, WARRANTY, DOCUMENT_LOAD
        question: body.question as string, // User input
        recordKeys: body.recordKeys as string[], // DOCUMENT LOAD
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
  }
);
