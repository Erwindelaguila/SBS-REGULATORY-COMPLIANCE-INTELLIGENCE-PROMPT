import { Context, LambdaFunctionURLEvent } from "aws-lambda";
import { logger, promptRegulatoryComplianceEntrypoint } from "../app";

export const handler = awslambda.streamifyResponse(
  async (event: LambdaFunctionURLEvent, responseStream: awslambda.HttpResponseStream, _: Context) => {
    const body = JSON.parse(event.body!) as any;
    logger.debug({ body }, "Body");

    try {

      if (!body.sessionId || !body.application || !body.question) {
        const errorMessage = JSON.stringify({
          error: "Missing required fields: sessionId, application, question",
        });
        responseStream.write(errorMessage);
        responseStream.end();
        return;
      }


      const messageId = (body.sessionId as string).split(":")[1] || body.sessionId;
      
      const promptRegComplOutput = await promptRegulatoryComplianceEntrypoint.handleRequest({
        messageId, 
        application: body.application as string, 
        question: body.question as string, 
        recordKeys: body.recordKeys as string[], 
        conversationHistory: body.conversationHistory || [],
      });

      
      const isDocumentGenerated = promptRegComplOutput.isDocumentGenerated || false;
      const documentType = promptRegComplOutput.documentType || null;

      logger.debug({ isDocumentGenerated, documentType }, "Document generation status");
      
      if ((body.application === "WARRANTY" || body.application === "LETTER") && isDocumentGenerated) {
        responseStream.write('[DOCUMENT_GENERATED]\n\n');
        logger.debug(`Added [DOCUMENT_GENERATED] keyword at START for ${documentType}`);
      }
      
      let fullResponse = "";

      for await (const chunk of promptRegComplOutput.result) {

        const chunkText = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
        fullResponse += chunkText;
        
        responseStream.write(chunkText);
      }

      logger.debug("Finish writing response");
      responseStream.end();

      logger.debug({ fullResponse, isDocumentGenerated, documentType }, "Full response");
    } catch (error) {
      if (error instanceof Error) {
        logger.error({ err: error }, "Error in lambda handler");
      }
    }
  }
);
