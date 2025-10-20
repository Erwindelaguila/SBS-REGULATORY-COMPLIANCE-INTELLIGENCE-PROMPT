export interface SourceProcessRepository{
  getSources(sources: string[], flow:string):Promise<string[]>
}

