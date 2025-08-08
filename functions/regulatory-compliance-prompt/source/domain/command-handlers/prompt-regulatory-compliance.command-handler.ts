import { Logger } from "pino";
import { AIChatClient } from "../ports/ai-chat.client";
import { FileStorageClient } from "../ports/file-storage.client";
import { SystemPromptsRepository } from "../ports/system-prompts.repository";
import { PromptRegulatoryComplianceCommand } from "../commands/prompt-regulatory-compliance.command";
import { Readable } from "stream";

export interface PromptRegComplCommandHandlerOutput {
  result: Readable;
  fileKeys: string[];
}

export class PromptRegulatoryComplianceCommandHandler {
  constructor(
    private readonly fileStorageClient: FileStorageClient,
    private readonly systemPromptsRepository: SystemPromptsRepository,
    private readonly aiChatClient: AIChatClient,
    private readonly logger: Logger,
  ) {}

  async handle(command: PromptRegulatoryComplianceCommand): Promise<PromptRegComplCommandHandlerOutput> {
    try {
      /* // Get system prompts
      const systemPrompts = await this.systemPromptsRepository.getSystemPrompt();
      if (systemPrompts.length === 0) {
        throw new Error("No system prompts found");
      }
      const systemPrompt = systemPrompts[0].prompt; // Assuming we take the first prompt
      */
      const SYSTEM_PROMPT =
        "Eres un modelo de lenguaje que debe responder estrictamente en formato Markdown usando dos secciones: \"### Respuestas de Archivos\" y \"### Respuesta General\".\n\n1. En la sección \"Respuestas de Archivos\", incluye una subsección por archivo usando el formato:\n#### Archivo: {nombreArchivo}\n- **Remitente**: nombre del remitente o 'No encontrado en el archivo'\n- **Destinatario**: nombre del destinatario o 'No encontrado en el archivo'\n- **Asunto**: texto del asunto o 'No encontrado en el archivo'\n- **Respuesta**: respuesta a la pregunta específica hecha sobre el archivo\n\n2. En la sección \"Respuesta General\", proporciona una respuesta general o conclusión basada en todos los archivos subidos.\n\nNo generes nada fuera de la estructura Markdown. Usa encabezados y viñetas claramente. Si el remitente, destinatario o asunto no pueden encontrarse, siempre devuelve 'No encontrado en el archivo'. Mantén tu formato consistente. nombreArchivo no debe incluir la extensión del archivo. Además, al final, genera una tabla cuyas columnas sean Archivo, Remitente, Destinatario, Asunto, Respuesta y para cada documento enviado hay una fila.";

      // Get files by keys
      const filesData = await this.fileStorageClient.getFilesByKey(command.recordKeys);

      // Get AI chat response
      const aiResponse = await this.aiChatClient.getChatResponse(SYSTEM_PROMPT, command.question, filesData);

      return {
        result: aiResponse,
        fileKeys: command.recordKeys, // Assuming we return the same keys as part of the response
      };
    } catch (err) {
      // TODO: Handle specific errors and their codes
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to handle PromptRegulatoryComplianceCommand");
      }
      throw err;
    }
  }
}
