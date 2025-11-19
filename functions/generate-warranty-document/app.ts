import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { GenerateWarrantyDocumentEntrypoint } from "./source/entrypoints/generate-warranty-document.entrypoint";

/**
 * AWS Lambda Handler para generar documentos Word de WARRANTY
 * Recibe petición HTTP con markdownContent y devuelve archivo .docx en base64
 * 
 * Este handler funciona igual que local.server.ts (POST /generate-document)
 * pero adaptado para producción en AWS Lambda
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Parsear body de la petición
    const body = JSON.parse(event.body || "{}");
    const { markdownContent, application } = body;

    // Validar que existe markdownContent
    if (!markdownContent || typeof markdownContent !== "string") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Missing required field: markdownContent (must be string)",
        }),
      };
    }

    // Log para debugging (opcional, se verá en CloudWatch)
    console.log(`Generating ${application || "WARRANTY"} document from Markdown...`);

    // Crear instancia del entrypoint
    const entrypoint = new GenerateWarrantyDocumentEntrypoint();

    // Generar documento Word
    const result = await entrypoint.execute(markdownContent);

    // Convertir buffer a base64 (igual que local.server.ts hace con res.send(buffer))
    const base64Result = result.buffer.toString("base64");

    console.log(`Document generated: ${result.filename} (${result.buffer.length} bytes)`);

    // Devolver archivo Word en base64
    // IMPORTANTE: isBase64Encoded: true es necesario para que API Gateway decodifique correctamente
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      isBase64Encoded: true, // 👈 CRÍTICO: sin esto, el archivo se corrompe
      body: base64Result,
    };
  } catch (error) {
    console.error("Error generating document:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Error generating document",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
