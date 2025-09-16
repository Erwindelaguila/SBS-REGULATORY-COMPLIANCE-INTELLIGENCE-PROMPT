import { Application } from "./application";

export type SystemPrompt = {
    id: string;
    version: number;
    application: Application;
    prompt: string;
    promptType: string;
    documentType: string;
}