import {
  BedrockRuntimeClient,
  ContentBlock,
  ConverseStreamCommand,
  ConverseStreamOutput,
  DocumentFormat,
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
    for await (const chunk of bedrockStream) {
      yield chunk.contentBlockDelta?.delta?.text || "";
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
      // TODO: Handle specific Bedrock errors
      if (error instanceof Error) {
        this.logger.error({ error }, "Failed to get chat response from Bedrock AI");
      }
      throw error;
    }
  }
}
