import { BedrockRuntimeClient, ContentBlock, ConverseStreamCommand, ConverseStreamOutput } from "@aws-sdk/client-bedrock-runtime";
import { AIChatClient } from "../domain/ports/ai-chat.client";
import { Logger } from "pino";
import { Readable } from "stream";

export class BedrockAIChatClient implements AIChatClient {
  constructor(
    private readonly bedrockRuntimeClient: BedrockRuntimeClient,
    private readonly modelId: string,
    private readonly logger: Logger,
  ) {}

  private async* streamToAsyncIterator(bedrockStream: AsyncIterable<ConverseStreamOutput>) {
    for await (const chunk of bedrockStream) {
      yield chunk.contentBlockDelta?.delta?.text || "";
    }
  }

  async getChatResponse(
    systemPrompt: string,
    // conversation: Message[], // TODO: pass the conversation history
    userPrompt: string,
    filesBytes: Uint8Array[],
  ): Promise<Readable> {
    try {
      const files: ContentBlock[] = filesBytes.map((fileBytes, index) => ({
        document: {
          format: "pdf", 
          name: `file${index + 1}`, 
          source: {
            bytes: fileBytes,
          },
        }
      })) 
      const converseCommand = new ConverseStreamCommand({
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