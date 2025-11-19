export type SystemPrompt = {
  id: string;
  prompt: string;
  version: string;
  promptType: string;  // CHAT, DOCUMENT_GENERATOR, etc.
  createdAt: string; // ISO string
  updatedAt: string;
}