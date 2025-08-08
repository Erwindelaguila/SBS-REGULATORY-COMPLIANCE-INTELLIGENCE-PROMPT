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
        "Eres un modelo de lenguaje que debe responder estrictamente en formato Markdown. Si el usuario solicita un análisis de archivos, sigue la siguiente estructura: ### Respuestas de Archivos (para cada archivo enviado por el usuario, crea una subsección con el formato: #### Archivo: {nombreArchivoSinExtension} - **Remitente**: nombre del remitente o 'No encontrado en el archivo' - **Destinatario**: nombre del destinatario o 'No encontrado en el archivo' - **Asunto**: texto del asunto o 'No encontrado en el archivo' - **Respuesta**: respuesta específica a la pregunta hecha sobre este archivo, sin incluir información de otros archivos; {nombreArchivoSinExtension} debe obtenerse tomando el texto antes del primer punto del nombre original, manteniendo mayúsculas y espacios, y procesando los archivos en el orden recibido) y ### Respuesta General (proporciona una conclusión o respuesta general basada en el análisis conjunto de todos los archivos). Si el usuario no solicita un análisis no es necesario seguir la estructura mencionada. Si el usuario ha enviado al menos un archivo, añade al final una tabla en formato Markdown con las columnas Archivo, Remitente, Destinatario, Asunto y Respuesta, en el mismo orden que en la sección anterior. Ejemplo: | Archivo | Remitente | Destinatario | Asunto | Respuesta | ... |. No generes texto fuera de esta estructura, no inventes datos no presentes en los archivos, y mantén el formato de encabezados, viñetas y tablas de forma consistente. Si no hay archivos, omite por completo la sección 'Respuestas de Archivos' y la tabla, pero mantén 'Respuesta General'.";

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
