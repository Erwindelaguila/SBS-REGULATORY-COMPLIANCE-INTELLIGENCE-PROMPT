import { Logger } from "pino";
import { AIChatClient } from "../ports/ai-chat.client";
import { FileStorageClient } from "../ports/file-storage.client";
import { SystemPromptsRepository } from "../ports/system-prompts.repository";
import { PromptRegulatoryComplianceCommand } from "../commands/prompt-regulatory-compliance.command";
import { PassThrough, Readable, Transform } from "stream";

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

        // console.log({ value, temporalConcatenatedChunks }, "Chunk");

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

        const delimiterSubString = temporalConcatenatedChunks.slice(firstNumeralIndex, DELIMITER.length);
        if (delimiterSubString.length < DELIMITER.length) {
          callback(null, Buffer.from(temporalConcatenatedChunks.slice(0, firstNumeralIndex)));
          temporalConcatenatedChunks = temporalConcatenatedChunks.slice(firstNumeralIndex);
          return;
        }

        let lastValidIndex = 0;
        const isValid = delimiterSubString.split("").every((char, index) => {
          const result = char === DELIMITER[index];
          lastValidIndex = result ? index : lastValidIndex;
          return result;
        });

        if (!isValid) {
          callback(null, Buffer.from(temporalConcatenatedChunks.slice(0, lastValidIndex + 1)));
          temporalConcatenatedChunks = temporalConcatenatedChunks.slice(lastValidIndex + 1);
          return;
        }

        userMessageEnded = true;
        callback(null);
      },
    });
  }

  private async saveCsv(value: string, documentName: string) {
    this.logger.debug(`Saving CSV file with name: ${documentName}`);
    await this.csvFileStorageClient.uploadFile(documentName, new TextEncoder().encode(value), "text/csv");
    this.logger.debug("CSV file saved");
  }

  private readData(messageId: string): PassThrough {
    let resultString = "";

    const stream = new PassThrough();
    stream.on("data", (chunk: string) => {
      if (chunk) {
        resultString += chunk.toString();
      }
    });

    stream.on("end", async () => {
      this.logger.debug({ resultString }, "Read data");
      if (!this.saveCSVFlag) {
        return;
      }

      const values = resultString.split(this.DELIMITER);
      values.shift();

      const results = await Promise.allSettled(
        values.map(async (value, index) => {
          let documentName = "";
          switch (index) {
            case 0:
              documentName = `summary/csv-result-${messageId}.csv`;
              break;
            case 1:
              documentName = `pdf-highlights/csv-result-${messageId}.csv`;
              break;
            default:
              documentName = `default/csv-result-${messageId}.csv`;
              break;
          }
          return this.saveCsv(value.trim(), documentName);
        }),
      );

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          this.logger.debug({ result }, "CSV saved");
        } else {
          this.logger.error({ result }, "Failed to save CSV");
        }
      });
    });

    stream.on("error", (error) => {
      this.logger.error({ error }, "Failed to read data");
    });

    return stream;
  }

  async handle(command: PromptRegulatoryComplianceCommand): Promise<PromptRegComplCommandHandlerOutput> {
    try {
      // Get system prompts
      const systemPrompts = await this.systemPromptsRepository.getSystemPrompt(command.application, "default");
      if (systemPrompts.length === 0) {
        throw new Error("No system prompts found");
      }
      const systemPrompt = systemPrompts[0].prompt; // Assuming we take the first prompt
      this.logger.info({ systemPrompt }, "System prompt");

      // Get files by keys
      const filesData = await this.documentsFileStorageClient.getFilesByKey(command.recordKeys);
      this.logger.info(
        {
          filesData: filesData.map((file) => ({
            key: file.key,
            bytes: file.bytes.length,
            contentType: file.contentType,
          })),
        },
        "Files data",
      );

      // Get AI chat response
      const chatResponse = await this.aiChatClient.getChatResponse(systemPrompt, command.question, filesData);
      const processedResponse = new PassThrough();

      chatResponse.pipe(this.readData(command.messageId)).pipe(this.filterNotUserMessages()).pipe(processedResponse);

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
