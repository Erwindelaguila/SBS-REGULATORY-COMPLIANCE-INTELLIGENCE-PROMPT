import { Logger } from "pino";
import { AIChatClient } from "../ports/ai-chat.client";
import { FileStorageClient } from "../ports/file-storage.client";
import { SystemPromptsRepository } from "../ports/system-prompts.repository";
import { PromptRegulatoryComplianceCommand } from "../commands/prompt-regulatory-compliance.command";
import { PassThrough, Readable, Transform } from "stream";

import { v4 as uuid } from "uuid";

export interface PromptRegComplCommandHandlerOutput {
  result: Readable;
  fileKeys: string[];
}

export class PromptRegulatoryComplianceCommandHandler {
  private readonly DELIMITER: string = "###---###";

  constructor(
    private readonly documentsFileStorageClient: FileStorageClient,
    private readonly csvFileStorageClient: FileStorageClient,
    private readonly systemPromptsRepository: SystemPromptsRepository,
    private readonly aiChatClient: AIChatClient,
    private readonly saveCSVFlag: boolean,
    private readonly logger: Logger,
  ) {}

  private filterNotUserMessages(): Transform {
    let temporalConcatenatedChunks = "";
    let userMessageEnded = false;
    const DELIMITER = this.DELIMITER;

    return new Transform({
      transform(chunk, encoding, callback) {
        if (userMessageEnded) {
          callback(null);
          return;
        }

        const value = Buffer.from(chunk).toString();
        temporalConcatenatedChunks += value;

        const firstNumeralIndex = temporalConcatenatedChunks.indexOf("#");
        if (firstNumeralIndex === -1) {
          callback(null, Buffer.from(temporalConcatenatedChunks));
          temporalConcatenatedChunks = "";
          return;
        }

        if (firstNumeralIndex !== 0) {
          const value = temporalConcatenatedChunks.slice(0, firstNumeralIndex);
          temporalConcatenatedChunks = temporalConcatenatedChunks.slice(firstNumeralIndex);
          callback(null, Buffer.from(value));
          return;
        }

        let lastValidIndex = 0;
        const delimiterSubString = temporalConcatenatedChunks.slice(firstNumeralIndex);

        const isValid = delimiterSubString.split("").every((char, index) => {
          lastValidIndex = index;
          return char === DELIMITER[index] || index >= DELIMITER.length;
        });

        if (!isValid) {
          callback(null, Buffer.from(temporalConcatenatedChunks.slice(0, lastValidIndex + 1)));
          temporalConcatenatedChunks = temporalConcatenatedChunks.slice(lastValidIndex);
          return;
        }

        if (temporalConcatenatedChunks.length >= DELIMITER.length) {
          callback(null);
          userMessageEnded = true;
          return;
        }
        callback(null);
      },
    });
  }

  private readCsv(sessionId: string): PassThrough {
    let resultString = "";

    const csvStream = new PassThrough();

    csvStream.on("data", (chunk: string) => {
      if (chunk) {
        resultString += chunk.toString();
      }
    });

    csvStream.on("end", async () => {
      this.logger.debug({ resultString }, "CSV read");
      if (!this.saveCSVFlag) {
        return;
      }

      const values = resultString.split(this.DELIMITER);
      if (values.length > 1) {
        const csvDocumentName = `csv-result-${sessionId}.csv`;
        this.logger.debug(`Saving CSV file with name: ${csvDocumentName}`);
        await this.csvFileStorageClient.uploadFile(
          csvDocumentName,
          new TextEncoder().encode(values[1].trim()),
          "text/csv",
        );
        this.logger.debug("CSV file saved");
      }
    });

    csvStream.on("error", (error) => {
      this.logger.error({ error }, "Failed to read CSV");
    });

    return csvStream;
  }

  async handle(command: PromptRegulatoryComplianceCommand): Promise<PromptRegComplCommandHandlerOutput> {
    try {
      /* // Get system prompts
      const systemPrompts = await this.systemPromptsRepository.getSystemPrompt();
      if (systemPrompts.length === 0) {
        throw new Error("No system prompts found");
      }
      const systemPrompt = systemPrompts[0].prompt; // Assuming we take the first prompt
      */

      /* let systemPrompt = "Responde siempre en markdown"
      
      if (/garant[ií]a/i.test(command.question)) {
        systemPrompt = "Eres un modelo de lenguaje que debe responder estrictamente en formato Markdown. Si el usuario solicita un análisis de archivos, debes producir dos secciones principales al mismo nivel de encabezado: (1) una sección con el encabezado ### Respuestas de Archivos y (2) una sección con el encabezado ### Respuesta General. En la sección ### Respuestas de Archivos, para cada archivo enviado por el usuario, crea una subsección con el encabezado #### Archivo: {nombreArchivoSinExtension} y debajo coloca exactamente cuatro líneas en este orden: - **Remitente**: nombre del remitente o 'No encontrado en el archivo' - **Destinatario**: nombre del destinatario o 'No encontrado en el archivo' - **Asunto**: texto del asunto o 'No encontrado en el archivo' - **Respuesta**: respuesta específica a la pregunta hecha sobre este archivo sin incluir información de otros archivos. El valor {nombreArchivoSinExtension} debe obtenerse tomando el texto antes del primer punto del nombre original, manteniendo mayúsculas y espacios, y listando los archivos en el orden recibido. En la sección ### Respuesta General, redacta una conclusión o respuesta general basada en el análisis conjunto de todos los archivos. Si el usuario no solicita un análisis de archivos, no uses esta estructura especial. Si el usuario ha enviado al menos un archivo, añade al final, después de la sección ### Respuesta General, una tabla en formato Markdown con las columnas Archivo, Remitente, Destinatario, Asunto y Respuesta, en el mismo orden que en la sección de archivos. Ejemplo: | Archivo | Remitente | Destinatario | Asunto | Respuesta | ... |. No generes texto fuera de esta estructura, no inventes datos que no estén presentes en los archivos y mantén el formato de encabezados, viñetas y tablas de forma consistente. Si no hay archivos, omite por completo la sección ### Respuestas de Archivos y la tabla, pero mantén la sección ### Respuesta General."
      } */

      const SYSTEM_PROMPT = `
      Eres un supervisor del equipo de la Superintendencia de Banca, Seguros y AFP del Perú y tienes como responsabilidad principal supervisar a todas las empresas del sistema financiero peruana a quienes llamaremos supervisados

      Los supervisados te envian documentos que contienen información relacionada a sus productos financieros (p.e. cartas, informes, memorandum, contratos y otro tipo de documentos de gestión) estos documentos ya se han adjuntado para tu revisión

      Tu objetivo es realizar la busqueda que ingresa el usuario en todo el contenido de los archivos adjuntos y se debe mostrar los resultados de busqueda en un formato que incluya lo siguiente:

      - Por cada archivo cargado genera resumen acerca del contenido del archivo y clasifica que tipo de documento es, solo si, el archivo contiene el texto solicitado por el usuario para la busqueda

      - Una sola tabla de resultados de busqueda para todos los arhivos cargados, con los siguientes campos: Archivo | Remitente | Destinatario | Asunto | Página | Resultado.
          - Archivo: nombre del archivo
          - Remitente: nombre del remitente o 'No encontrado en el archivo'
          - Destinatario: nombre del destinatario o 'No encontrado en el archivo' 
          - Asunto: texto del asunto o 'No encontrado en el archivo' 
          - Página: página dónde se encontró el resultado
          - Resultado: Párrafos que contiene el texto buscado por el usuario

      No generes texto fuera de esta estructura, no inventes datos que no estén presentes en los archivos y mantén el formato de encabezados, viñetas y tablas de forma consistente.

      Si no se han cargado archivos para la busqueda indica al usuario que seleccione sus archivos para el análisis en el arbol de archivos de cada entidad financiera.

      La respuesta debe de ser un texto markdown con la siguiente estructura {userMessage}{delimitador}{csv}, donde el delimitador es ${this.DELIMITER}. En la seccion "userMessage" debe de ir la respuesta en formato Markdown y en la seccion "csv" debe de ir el contenido de la tabla de resultados de busqueda en formato CSV.
      `;

      // Get files by keys
      const filesData = await this.documentsFileStorageClient.getFilesByKey(command.recordKeys);

      // Get AI chat response
      const chatReponse = await this.aiChatClient.getChatResponse(SYSTEM_PROMPT, command.question, filesData);
      const processedResponse = new PassThrough();

      chatReponse.pipe(this.readCsv(uuid())).pipe(this.filterNotUserMessages()).pipe(processedResponse);

      return {
        result: processedResponse,
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
