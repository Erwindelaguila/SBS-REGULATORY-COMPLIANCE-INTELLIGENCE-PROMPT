import { DynamoDBRecord } from "aws-lambda";
import { MetadataInsertionPromptCommandHandler } from "../domain/command-handlers/metadata-insertion-prompt.command-handler";
import {
  MetadataInsertionPromptCommand,
  MetadataInsertionPromptCommandRecord,
} from "../domain/commands/metadata-insertion-prompt.command";
import { unmarshall } from "@aws-sdk/util-dynamodb";

type MetadataInsertionPromptInput = {
  insertRecords: DynamoDBRecord[];
  systemPrompt: string;
  userPrompt: string;
};

export class MetadataInsertionPromptEntryPoint {
  constructor(private readonly metadataInsertionPromptCommandHandler: MetadataInsertionPromptCommandHandler) {}

  public async handleRequest(metadataInsInput: MetadataInsertionPromptInput): Promise<void> {
    const records: MetadataInsertionPromptCommandRecord[] = metadataInsInput.insertRecords
      .map((insertRecord) => {
        if (insertRecord.dynamodb === undefined || insertRecord.dynamodb.NewImage === undefined) {
          return null;
        }
        const jsonRecord = unmarshall(insertRecord.dynamodb.NewImage as any);
        return {
          recordId: jsonRecord.id,
          key: jsonRecord.key,
          metadata: jsonRecord.metadata,
        };
      })
      .filter((record) => record !== null);

    const command = MetadataInsertionPromptCommand.createCommand(
      records,
      metadataInsInput.systemPrompt,
      metadataInsInput.userPrompt,
    );

    await this.metadataInsertionPromptCommandHandler.handle(command);
  }
}
