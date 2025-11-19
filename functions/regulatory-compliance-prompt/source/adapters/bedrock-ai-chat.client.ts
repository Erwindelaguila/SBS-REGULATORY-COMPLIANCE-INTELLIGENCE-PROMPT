import {
  BedrockRuntimeClient,
  ContentBlock,
  ConverseStreamCommand,
  ConverseStreamOutput,
  DocumentFormat,
  ThrottlingException,
} from "@aws-sdk/client-bedrock-runtime";
import { AIChatClient, FileData } from "../domain/ports/ai-chat.client";
import { Logger } from "pino";
import { Readable } from "stream";

export class BedrockAIChatClient implements AIChatClient {
  constructor(
    private readonly bedrockRuntimeClient: BedrockRuntimeClient,
    private readonly modelId: string,
    private readonly logger: Logger,
  ) {}

  private async *streamToAsyncIterator(bedrockStream: AsyncIterable<ConverseStreamOutput>) {
    let totalChunks = 0;
    let totalChars = 0;
    
    try {
      for await (const chunk of bedrockStream) {
        const text = chunk.contentBlockDelta?.delta?.text || "";
        totalChunks++;
        totalChars += text.length;
        
        // Log cada 50 chunks
        if (totalChunks % 50 === 0) {
          this.logger.debug({ totalChunks, totalChars }, "Streaming progress");
        }
        
        // Verificar si el stream terminó normalmente
        if (chunk.messageStop) {
          this.logger.info({ 
            totalChunks, 
            totalChars, 
            stopReason: chunk.messageStop.stopReason 
          }, "Stream stopped by Claude");
        }
        
        yield text;
      }
      
      this.logger.info({ totalChunks, totalChars }, "Stream completed successfully");
    } catch (error) {
      this.logger.error({ error, totalChunks, totalChars }, "Stream error");
      throw error;
    }
  }

  private parseContentTypeToFormat(contentType: string): DocumentFormat {
    switch (contentType) {
      case "application/pdf":
        return "pdf";
      case "application/msword":
        return "doc";
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "docx";
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        return "xlsx";
      case "application/vnd.ms-excel":
        return "xls";
      default:
        return "txt";
    }
  }

  private parseDocumentName(key: string): string {
    return key.replace(/[^a-zA-Z0-9\s\-()[\]]|\s{2,}/g, "");
  }

  private removeExtension(fileName: string): string {
    const index = fileName.lastIndexOf(".");
    if (index === -1) {
      return fileName;
    }
    return fileName.substring(0, index);
  }

  async getChatResponse(
    systemPrompt: string,
    // conversation: Message[], // TODO: pass the conversation history
    userPrompt: string,
    filesData: FileData[],
  ): Promise<Readable> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 segundo

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const files = filesData.map(
          (fileData): ContentBlock => ({
            document: {
              name: this.parseDocumentName(this.removeExtension(fileData.key)),
              source: {
                bytes: fileData.bytes,
              },
              format: this.parseContentTypeToFormat(fileData.contentType),
            },
          }),
        );

        this.logger.debug(
          {
            files: files.map((file) => ({
              name: file.document!.name,
              format: file.document!.format,
              bytes: file.document!.source!.bytes!.length,
            })),
          },
          "Files to send to Bedrock",
        );

        const converseCommand = new ConverseStreamCommand({
          modelId: this.modelId,
          system: [{ text: systemPrompt }],
          messages: [
            {
              role: "user",
              content: [
                {
                  text: userPrompt,
                },
                ...files,
              ],
            },
          ],
        });
        
        const response = await this.bedrockRuntimeClient.send(converseCommand);
        
        if (!response.stream) {
          throw new Error("No response stream received from Bedrock AI");
        }
        
        const readable = Readable.from(this.streamToAsyncIterator(response.stream));
        return readable;
        
      } catch (error) {
        const isThrottling = error instanceof ThrottlingException;
        const isLastAttempt = attempt === maxRetries;

        this.logger.error({ 
          error, 
          attempt, 
          maxRetries,
          isThrottling,
          willRetry: isThrottling && !isLastAttempt
        }, "Failed to get chat response from Bedrock AI");

        if (isThrottling && !isLastAttempt) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = baseDelay * Math.pow(2, attempt - 1);
          this.logger.warn({ delay, attempt }, `⏳ Throttled by AWS. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry
        }

        if (isThrottling) {
          return Readable.from([
            "⚠️ El servicio está temporalmente saturado. Por favor intenta nuevamente en unos segundos."
          ]);
        }

        throw error;
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new Error("Max retries exceeded");
  }
}
