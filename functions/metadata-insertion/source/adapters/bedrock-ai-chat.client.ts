import { BedrockRuntimeClient, ContentBlock, ConverseCommand, DocumentFormat } from "@aws-sdk/client-bedrock-runtime";
import { AIChatClient, RecordData, RecordMetadata } from "../domain/ports/ai-chat.client";
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

  private removeExtension(fileName: string): string {
    const index = fileName.lastIndexOf(".");
    if (index === -1) {
      return fileName;
    }
    return fileName.substring(0, index);
  }

  private removeHyphens(str: string): string {
    return str.replace(/-/g, "");
  }

  private addUuidHyphens(str: string): string {
    return str
      .split(/(.{8})(.{4})(.{4})(.{4})(.{12})/g)!
      .filter(Boolean)
      .join("-");
  }

  async generateMetadata(systemPrompt: string, userPrompt: string, filesData: RecordData[]): Promise<RecordMetadata[]> {
    try {
      const files = filesData.map(
        (fileData): ContentBlock => ({
          document: {
            name: this.removeHyphens(fileData.recordId),
            source: {
              bytes: fileData.bytes,
            },
            format: this.parseContentTypeToFormat(fileData.contentType),
          },
        }),
      );
      const converseCommand = new ConverseCommand({
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
      this.logger.debug({ response }, "Bedrock response");

      const responseText = response.output?.message?.content?.[0]?.text;
      const parsedResponse: Array<any> = JSON.parse(responseText!);
      this.logger.debug({ parsedResponse }, "Parsed response from Bedrock to JSON");

      return parsedResponse.map((response) => ({
        recordId: this.addUuidHyphens(this.removeExtension(response.recordId)),
        metadata: response.metadata,
      }));
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to generate metadata");
      }
      throw err;
    }
  }
}
