import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { AIChatClient, AIChatResponse } from "../domain/ports/ai-chat.client";
import { Logger } from "pino";

export class BedrockAIChatClient implements AIChatClient {
  constructor(
    private readonly bedrockRuntimeClient: BedrockRuntimeClient,
    private readonly modelId: string,
    private readonly logger: Logger,
  ) {}

  async getChatResponse(
    systemPrompt: string,
    // conversation: Message[], // TODO: pass the conversation history
    userPrompt: string,
    filesBytes: Uint8Array[],
  ): Promise<AIChatResponse> {
    try {
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
              {
                document: {
                  format: "pdf", // TODO: complete with object attributes
                  name: "InformeInvestigacion", // TODO: complete with object attributes
                  source: {
                    bytes: filesBytes[0] // TODO: map filesBytes to the correct format
                  },
                  citations: {
                    enabled: true
                  }
                }
              }
            ]
          }
        ]
      })
      const response = await this.bedrockRuntimeClient.send(converseCommand);
      const responseText =
        response.output?.message?.content && response.output.message.content.length > 0
          ? response.output.message.content[0].text
          : "";
      return {
        response: responseText as string,
        fileKeys: ["informe-investigacion.pdf"]
      }
    } catch (error) { 
      // TODO: Handle specific Bedrock errors
      if (error instanceof Error) {
        this.logger.error({ error }, "Failed to get chat response from Bedrock AI");
      }
      throw error;
    }
  }

}