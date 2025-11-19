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
      // ✅ Validar campos obligatorios (igual que local.server.ts)
      if (!body.sessionId || !body.application || !body.question) {
        const errorMessage = JSON.stringify({
          error: "Missing required fields: sessionId, application, question",
        });
        responseStream.write(errorMessage);
        responseStream.end();
        return;
      }

      // ✅ Generar messageId desde sessionId (igual que local.server.ts)
      const messageId = (body.sessionId as string).split(":")[1] || body.sessionId;
      
      const promptRegComplOutput = await promptRegulatoryComplianceEntrypoint.handleRequest({
        messageId, // SessionId
        application: body.application as string, // LETTER, WARRANTY, DOCUMENT_LOAD
        question: body.question as string, // User input
        recordKeys: body.recordKeys as string[], // DOCUMENT LOAD
        conversationHistory: body.conversationHistory || [], // 👈 NUEVO: Historial de conversación para WARRANTY
      });

      // Check if document was generated (for WARRANTY only)
      const isDocumentGenerated = promptRegComplOutput.isDocumentGenerated || false;
      const documentType = promptRegComplOutput.documentType || null;

      logger.debug({ isDocumentGenerated, documentType }, "Document generation status");
      
      // ✅ SOLO PARA WARRANTY: Enviar palabra clave AL INICIO (antes del streaming)
      if (body.application === "WARRANTY" && isDocumentGenerated) {
        responseStream.write('[DOCUMENT_GENERATED]\n\n');
        logger.debug("Added [DOCUMENT_GENERATED] keyword at START for WARRANTY");
      }
      
      let fullResponse = "";

      for await (const chunk of promptRegComplOutput.result) {
        // ✅ Convertir Buffer a string si es necesario
        const chunkText = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
        fullResponse += chunkText;
        
        // Enviar chunk normal (texto plano para todos)
        responseStream.write(chunkText);
      }

      logger.debug("Finish writing response");
      responseStream.end();

      logger.debug({ fullResponse, isDocumentGenerated, documentType }, "Full response");
    } catch (error) {
      // TODO: handle send error responses
      if (error instanceof Error) {
        logger.error({ err: error }, "Error in lambda handler");
      }
    }
  }
);
