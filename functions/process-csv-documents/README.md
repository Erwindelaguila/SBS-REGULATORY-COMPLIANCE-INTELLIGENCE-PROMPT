# Process CSV Documents Function

Lambda function para procesar archivos CSV de reportes regulatorios y tablas internas de garantías (warranty) y cartas fianza (letter).

## Descripción

Esta función procesa archivos CSV desde S3, extrae y valida los datos según el tipo de aplicación y documento, y los almacena en las tablas DynamoDB correspondientes. También envía notificaciones a través de Kafka y SQS.

## Arquitectura

```
DynamoDB Stream Event
    ↓
Process CSV Documents Handler
    ↓
├─ Obtener archivos de S3
├─ Procesar según tipo
│   ├─ WARRANTY + REGULATORY → warranty-regulatory-reports.processor
│   ├─ WARRANTY + INTERNAL → warranty-internal-tables.processor
│   ├─ LETTER + REGULATORY → letter-regulatory-reports.processor
│   └─ LETTER + INTERNAL → letter-internal-tables.processor
├─ Subir a DynamoDB
└─ Enviar notificaciones (Kafka + SQS)
```

## Tipos de Procesamiento

### WARRANTY REGULATORY
- **Fuente**: Archivos CSV con reportes regulatorios de garantías (BDC03A)
- **Tabla destino**: Definida en `WARRANTY_RR_TABLE`
- **Características**:
  - Procesa TODOS los tipos de garantías (hipotecas, vehículos, fondos de garantía, etc.)
  - Compatible con Bancos (código 04) y Cajas Municipales (código 14)
  - Extracción de período del nombre de archivo (YYYYMM)
  - División de valores por moneda (PEN, USD, OTH)
  - Conversión de fechas Excel a formato dd/MM/yyyy
  - Limpieza de campos de nombre

### WARRANTY INTERNAL
- **Fuente**: CSVs de tablas internas de garantías
- **Tabla destino**: Definida en `WARRANTY_IT_TABLE`
- **Características**:
  - Generación de campo `codgr` (código cliente + código garantía)
  - Extracción de período del campo `period`
  - Conversión de fechas a formato dd/MM/yyyy

### LETTER REGULATORY
- **Fuente**: CSVs de reportes regulatorios de carta fianza
- **Tabla destino**: Definida en `LETTER_RR_TABLE`
- **Características**:
  - Limpieza de campo `ncl` (elimina comillas)
  - Conversión de valor 0 a null en campos específicos
  - Ordenamiento por `convenio_fmv`
  - Moneda fija: "PEN"

### LETTER INTERNAL
- **Fuente**: CSVs de tablas internas de carta fianza
- **Tabla destino**: Definida en `LETTER_IT_TABLE`
- **Características**:
  - Conversión de valor 0 a null en `saldo_mes_anterior`
  - Moneda fija: "PEN"

## Variables de Entorno

```bash
# S3
S3_DOCUMENTS_BUCKET_NAME=nombre-del-bucket

# DynamoDB Tables
WARRANTY_RR_TABLE=warranty-regulatory-reports
WARRANTY_IT_TABLE=warranty-internal-tables
LETTER_RR_TABLE=letter-regulatory-reports
LETTER_IT_TABLE=letter-internal-tables

# Kafka
KAFKA_BROKERS=broker1:9092,broker2:9092

# SQS
INTERACTION_WEBSOCKET_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/queue-name
```

## Estructura del Proyecto

```
process-csv-documents/
├── source/
│   ├── adapters/               # Implementaciones de puertos
│   │   ├── dyn-table.repository.ts
│   │   ├── kafka-producer.adapter.ts
│   │   ├── s3-file-storage.client.ts
│   │   └── sqs-queue.client.ts
│   ├── domain/
│   │   ├── command-handlers/   # Lógica de negocio
│   │   │   └── process-csv-documents.command-handler.ts
│   │   ├── commands/           # Comandos
│   │   │   └── process-csv-documents.command.ts
│   │   ├── errors/             # Errores personalizados
│   │   │   ├── csv-processor.error.ts
│   │   │   ├── file-storage.error.ts
│   │   │   └── repository.error.ts
│   │   ├── model/              # Modelos de dominio
│   │   │   ├── application.ts
│   │   │   ├── csv-record-data.ts
│   │   │   ├── document-type.ts
│   │   │   ├── notification-type.ts
│   │   │   └── notification.ts
│   │   ├── ports/              # Interfaces
│   │   │   ├── csv-processor.interface.ts
│   │   │   ├── event-producer.client.ts
│   │   │   ├── file-storage.client.ts
│   │   │   ├── queue.client.ts
│   │   │   └── table.repository.ts
│   │   └── processors/         # Procesadores CSV
│   │       ├── letter-internal-tables.processor.ts
│   │       ├── letter-regulatory-reports.processor.ts
│   │       ├── warranty-internal-tables.processor.ts
│   │       └── warranty-regulatory-reports.processor.ts
│   ├── entrypoints/            # Punto de entrada
│   │   └── process-csv-documents.entrypoint.ts
│   ├── utils/                  # Utilidades
│   │   └── csv-utils.ts
│   └── app.ts                  # Handler principal
├── package.json
├── tsconfig.json
├── esbuild.js
└── Dockerfile
```

## Formato de Entrada (DynamoDB Stream)

```json
{
  "id": "uuid",
  "key": "path/to/file.csv",
  "sessionId": "session-uuid",
  "parentId": "parent-uuid",
  "application": "WARRANTY" | "LETTER",
  "documentType": "REGULATORY" | "INTERNAL",
  "period": "2024-01-01T00:00:00.000Z"
}
```

## Notificaciones

### Kafka Topics
- `regulatory-compliance-prompts.insert-warranty-regulatory-report`
- `regulatory-compliance-prompts.insert-warranty-internal-table`
- `regulatory-compliance-prompts.insert-letter-regulatory-report`
- `regulatory-compliance-prompts.insert-letter-internal-table`

### SQS Messages
Todas las notificaciones también se envían a SQS con el formato:
```json
{
  "sessionId": "uuid",
  "type": "notification-type",
  "data": {
    "recordId": "uuid",
    "parentId": "uuid",
    "recordCount": 123
  }
}
```

## Build y Deploy

```bash
# Instalar dependencias
yarn install

# Compilar TypeScript
yarn compile

# Build para producción
yarn build

# Ejecutar tests
yarn test

# Linting
yarn lint

# Format code
yarn format
```

## Desarrollo

Los procesadores CSV implementan la interfaz `CsvProcessor`:

```typescript
interface CsvProcessor {
  process(recordData: CsvRecordData): Promise<Record<string, any>[]>;
}
```

Para agregar un nuevo tipo de procesamiento:
1. Crear un nuevo procesador en `domain/processors/`
2. Implementar la interfaz `CsvProcessor`
3. Registrar el procesador en el `ProcessCsvDocumentsCommandHandler`
4. Agregar la variable de entorno para la tabla destino
5. Actualizar el `NotificationType` si es necesario

## Dependencias Principales

- `@aws-sdk/client-s3`: Cliente S3 para obtener archivos
- `@aws-sdk/lib-dynamodb`: Cliente DynamoDB para almacenar registros
- `@aws-sdk/client-sqs`: Cliente SQS para notificaciones
- `kafkajs`: Cliente Kafka para eventos
- `csv-parse`: Parser de CSV
- `date-fns`: Manejo de fechas
- `pino`: Logger
- `uuid`: Generación de UUIDs
