import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBStreamEvent } from 'aws-lambda';
import { S3FileStorageClient } from './source/adapters/s3-file-storage.client';
import { S3Client } from '@aws-sdk/client-s3';
import { DynSupervisoryRecordsRepository } from './source/adapters/dyn-supervisory-records.repository';
import pino from 'pino';
import { BedrockAIChatClient } from './source/adapters/bedrock-ai-chat.client';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { MetadataInsertionPromptCommandHandler } from './source/domain/command-handlers/metadata-insertion-prompt.command-handler';
import { MetadataInsertionPromptEntryPoint } from './source/entrypoints/metadata-insertion-prompt.entrypoint';

const logger = pino({
  level: "debug"
});

const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const fileStorageClient = new S3FileStorageClient(new S3Client({}), process.env.S3_BUCKET_NAME!, logger);

const supervisoryRecordsRepository = new DynSupervisoryRecordsRepository(
  dynamoDBDocumentClient,
  process.env.SUPERVISORY_RECORDS_TABLE_NAME!,
  logger,
);

const aiChatClient = new BedrockAIChatClient(
  new BedrockRuntimeClient({
    region: "us-east-1",
  }),
  process.env.BEDROCK_MODEL_ID!,
  logger,
);

const metadataInsertionPromptCommandHandler = new MetadataInsertionPromptCommandHandler(
  aiChatClient,
  fileStorageClient,
  supervisoryRecordsRepository,
  logger,
);

const metadataInsertionPromptEntrypoint = new MetadataInsertionPromptEntryPoint(
  metadataInsertionPromptCommandHandler,
);

const SYSTEM_PROMPT = 'Debes responder únicamente con JSON válido. Sin texto explicativo, sin formato markdown, sin comentarios adicionales - solo JSON puro. Tu respuesta debe ser siempre un arreglo de objetos, nunca un objeto único o estructura anidada. Cada objeto en el arreglo debe de tener la siguiente estructura:  con la estructura {"metadata": {}, "recordId": ""}, donde la respuesta debe de ir en el campo "metadata" y el nombre del archivo en el "recordId". Cada campo dentro del metadata debe contener pares clave-valor con valores concisos y precisos. Sin backticks, solo raw JSON';

const USER_PROMPT = `
  De cada archivo/documento proporcionado, identifica palabras o términos clave y genera un objeto clave-valor con estos datos. Los campos más importantes a identificar son "sender", "receiver", "subject", pero si identificas campos adicionales relevantes, inclúyelos también. Para cada clave, los valores no deben ser extensos - solo valores precisos y concisos. Retorna un arreglo con los objetos generados para cada archivo.

  Campos requeridos (cuando estén disponibles):
  - sender: Quién envió/creó el documento
  - receiver: Quién recibió/es el destinatario del documento
  - subject: Tema principal o título del documento

  Campos adicionales que puedes incluir:
  - date, document_type, priority, reference_number, organization, department, status, etc.

  Mantén todos los valores concisos y factuales.
`;

export const handler = async (event: DynamoDBStreamEvent) => {
  try {
    await metadataInsertionPromptEntrypoint.handleRequest({
      insertRecords: event.Records,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: USER_PROMPT,
    });

    return { 
      statusCode: 200, 
      body: JSON.stringify({
        message: 'Metadata Insertion Prompt Function',
      })
    };
    
  } catch (error) {
    console.error('Error in Metadata Insertion Prompt Function:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({
        message: 'Internal Server Error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};