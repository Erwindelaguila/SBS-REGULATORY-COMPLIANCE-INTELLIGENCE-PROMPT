import { GetAnalysisSheetCommandHandler } from "../domain/command-handlers/get-analysis-sheet.command-handler";
import { GetAnalysisSheetCommand } from "../domain/commands/get-analysis-sheet.command";

type GetAnalysisSheetInput = {
  uuid: string;
};
type GetAnalysisSheetOutput = {
  downloadName: string;
  buffer: Buffer;
};

export class GetAnalysisSheetEntryPoint {
  constructor(private readonly getAnalysisSheetCommandHandler: GetAnalysisSheetCommandHandler) {}

  async handleRequest(getAnalysisSheetInput: GetAnalysisSheetInput): Promise<GetAnalysisSheetOutput> {
    const getAnalysisSheetCommand = GetAnalysisSheetCommand.createCommand({ uuid: getAnalysisSheetInput.uuid });
    const result = await this.getAnalysisSheetCommandHandler.execute(getAnalysisSheetCommand);
    return {
      downloadName: result.downloadName,
      buffer: result.buffer,
    };
  }
}
