type Uuid = `${string}-${string}-${string}-${string}-${string}`

export interface SystemPrompt {
  id: Uuid;
  content: string; 
  application: string; // Búsqueda documental | Evaluación de garantías | ...
  version: string;
  type: string;

  createdAt: string;
  updatedAt: string;
}