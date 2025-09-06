export class GetAnalysisSheetCommand {
  constructor(public readonly key: string) {}

  static createCommand(commandInput: { uuid: string }): GetAnalysisSheetCommand {
    const key = `summary/csv-result-${commandInput.uuid}.csv`;
    return new GetAnalysisSheetCommand(key);
  }
}
