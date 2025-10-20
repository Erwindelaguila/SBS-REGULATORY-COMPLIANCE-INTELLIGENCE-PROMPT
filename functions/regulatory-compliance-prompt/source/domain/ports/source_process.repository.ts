export interface SourceProcessRepository{
    getSources(sources: string[]):Promise<string[]>
}
