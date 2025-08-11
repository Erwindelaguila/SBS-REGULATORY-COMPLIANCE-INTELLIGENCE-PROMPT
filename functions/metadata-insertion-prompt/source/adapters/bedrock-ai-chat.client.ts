import { BedrockRuntimeClient, ContentBlock, ConverseCommand, DocumentFormat } from "@aws-sdk/client-bedrock-runtime";
import { AIChatClient, FileData } from "../domain/ports/ai-chat.client";
import { Logger } from "pino";

export class BedrockAIChatClient implements AIChatClient {
  constructor(
    private readonly bedrockRuntimeClient: BedrockRuntimeClient,
    private readonly modelId: string,
    private readonly logger: Logger,
  ) {}

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
    return key.replace(/[^a-zA-Z0-9]/g, '');
  }

  async generateMetadata(
    systemPrompt: string, 
    userPrompt: string, 
    filesData: FileData[]
  ): Promise<Record<string, any>> {
    try {
      const files = filesData.map((fileData): ContentBlock => ({
        document: {
          name: this.parseDocumentName(fileData.key),
          source: {
            bytes: fileData.bytes,
          },
          format: this.parseContentTypeToFormat(fileData.contentType),
        },
      }))
      const converseCommand = new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: systemPrompt }],
        messages: [
          {
            role:"user", 
            content: [
              { 
                text: userPrompt 
              },
              ...files
            ]
          }
        ]
      })
      const response = await this.bedrockRuntimeClient.send(converseCommand);
      const responseText = response.output?.message?.content?.[0]?.text;
      return JSON.parse(responseText ?? "{}"); 
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to generate metadata");
      }
      throw err;
    }
  }
}