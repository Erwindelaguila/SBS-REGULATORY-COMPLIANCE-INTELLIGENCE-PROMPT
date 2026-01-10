import { GetAnalysisSheetCommandHandler } from "../domain/command-handlers/get-analysis-sheet.command-handler";
import { GetAnalysisSheetCommand } from "../domain/commands/get-analysis-sheet.command";

type GetAnalysisSheetInput = {
  uuid: string;
  type?: 'csv' | 'subordinated-debt'; // Nuevo campo para distinguir tipo
};
type GetAnalysisSheetOutput = {
  downloadName: string;
  buffer: Buffer;
};

export class GetAnalysisSheetEntryPoint {
  constructor(private readonly getAnalysisSheetCommandHandler: GetAnalysisSheetCommandHandler) {}

  async handleRequest(getAnalysisSheetInput: GetAnalysisSheetInput): Promise<GetAnalysisSheetOutput> {
    // Si es análisis de deuda subordinada, usar método específico
    if (getAnalysisSheetInput.type === 'subordinated-debt') {
      const result = await this.getAnalysisSheetCommandHandler.executeSubordinatedDebtAnalysis(
        getAnalysisSheetInput.uuid
      );
      return {
        downloadName: result.downloadName,
        buffer: result.buffer,
      };
    }

    // Por defecto, usar el método CSV original
    const getAnalysisSheetCommand = GetAnalysisSheetCommand.createCommand({ uuid: getAnalysisSheetInput.uuid });
    const result = await this.getAnalysisSheetCommandHandler.execute(getAnalysisSheetCommand);
    return {
      downloadName: result.downloadName,
      buffer: result.buffer,
    };
  }
}
