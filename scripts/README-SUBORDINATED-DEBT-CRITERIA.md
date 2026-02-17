# Tabla de Criterios para Deuda Subordinada

## Propósito

Esta tabla almacena los **22 criterios regulatorios** (11 Local + 11 Internacional) de **Basilea III** y **Resolución SBS N° 3950-2022** que se utilizan para validar contratos de deuda subordinada automáticamente.

## Estructura de la Tabla

**Nombre:** `subordinated-debt-criteria`

**Tipo de facturación:** PAY_PER_REQUEST (on-demand)

**Esquema:**

| Campo | Tipo | Clave | Descripción |
|-------|------|-------|-------------|
| `id` | String | HASH | Identificador del criterio ("1", "2a", "2b", "3", "3a", "3b", "4", "5", "6", "7") |
| `tipo` | String | RANGE | Tipo de regulación ("Local" o "Internacional") |
| `orden` | Number | - | Orden de presentación en reportes (1-11) |
| `basilea` | String | - | Texto completo del criterio de Basilea III |
| `resolucion_sbs` | String | - | Texto completo de la Resolución SBS N° 3950-2022 |
| `resolucion_sbs_numero` | String | - | Número de resolución ("3950-2022") |
| `basilea_header` | String | - | Encabezado de columna Basilea ("Basilea III") |
| `resolucion_sbs_header` | String | - | Encabezado de columna SBS ("Resolución SBS N° 3950-2022") |

## Datos Almacenados

### Local (11 criterios)
1. Subordinación a depositantes y acreedores generales
2a. Vencimiento mínimo original de 5 años
2b. Sin step-ups ni incentivos para redimir
3. Opción de compra después de 5 años
3a. Aprobación supervisora para ejercer opción de compra
3b. Eventos fiscales y regulatorios dentro de primeros 5 años
4. Sin derecho a acelerar pagos (excepto quiebra)
5. Sin incrementos por calidad crediticia
6. No puede ser adquirida por el propio banco
7. Absorción de pérdidas en intervención/liquidación

### Internacional (11 criterios)
Los mismos criterios aplicados a contratos internacionales

## Despliegue

### 1. Crear la tabla en DynamoDB

```bash
cd suptech-regulatory-compliance-intelligence-prompt

# Opción A: Deploy completo del stack (recomendado)
sam deploy --profile protecso-qa-admin --config-env default

# Opción B: Deploy solo si ya existe el stack
sam deploy --no-confirm-changeset --profile protecso-qa-admin
```

### 2. Cargar los criterios regulatorios

**Prerequisito:** Asegúrate de tener el archivo `Criterios_Basilea_SBS_Contrato_Cumplimiento.json` en `c:\Users\erwin\Downloads\`

```bash
# Instalar dependencias si es primera vez
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# Ejecutar script de seed
node scripts/seed-subordinated-debt-criteria.js \
  --table subordinated-debt-criteria \
  --region us-east-1 \
  --profile protecso-qa-admin
```

**Salida esperada:**
```
📊 Iniciando carga de criterios regulatorios...
   Tabla: subordinated-debt-criteria
   Región: us-east-1
   Perfil: protecso-qa-admin

🔄 Convirtiendo criterios del JSON...
   Total de criterios encontrados: 22
   Criterios por tipo:
   - Local: 11
   - Internacional: 11

📋 Preview de criterios a cargar:
   [Local] Criterio 1: Subordinated to depositors and general creditors of the...
   [Local] Criterio 2a: Minimum original maturity of at least five years...
   [Local] Criterio 2b: There are no step-ups or other incentives to redeem...

⏳ Cargando criterios en DynamoDB...
✅ Lote 1 procesado: 22 items

✨ Carga completada:
   ✅ Éxito: 22 criterios
   
🎉 Todos los criterios regulatorios fueron cargados exitosamente!
```

### 3. Verificar carga exitosa

```bash
# Consultar criterios Local
aws dynamodb query \
  --table-name subordinated-debt-criteria \
  --key-condition-expression "id = :id" \
  --expression-attribute-values '{":id":{"S":"1"}}' \
  --region us-east-1 \
  --profile protecso-qa-admin

# Contar total de items
aws dynamodb scan \
  --table-name subordinated-debt-criteria \
  --select COUNT \
  --region us-east-1 \
  --profile protecso-qa-admin
```

**Resultado esperado:** `Count: 22`

## Consultas Típicas

### Obtener todos los criterios Local
```javascript
const params = {
  TableName: 'subordinated-debt-criteria',
  KeyConditionExpression: 'tipo = :tipo',
  ExpressionAttributeValues: {
    ':tipo': 'Local'
  }
};
const result = await docClient.query(params);
// Retorna 11 criterios
```

### Obtener criterio específico
```javascript
const params = {
  TableName: 'subordinated-debt-criteria',
  Key: {
    id: '1',
    tipo: 'Local'
  }
};
const result = await docClient.get(params);
```

### Obtener todos los criterios ordenados
```javascript
const params = {
  TableName: 'subordinated-debt-criteria',
  FilterExpression: 'tipo = :tipo',
  ExpressionAttributeValues: {
    ':tipo': 'Local'
  }
};
const result = await docClient.scan(params);
const sorted = result.Items.sort((a, b) => a.orden - b.orden);
```

## Uso en Lambda

Esta tabla será consultada por `ProcessSubordinatedDebtComplianceFunction` para obtener los criterios que se validarán contra cada contrato PDF usando Bedrock:

```typescript
// Ejemplo de uso en Lambda
const criterios = await getCriteriaByType('Local'); // 11 criterios
const pdf = await s3.getObject({ Bucket, Key });
const validation = await bedrock.validateContract(pdf, criterios);
// validation contiene cumplimiento para cada criterio
```

## Mantenimiento

### Actualizar un criterio
Si cambia la regulación, actualizar el item:

```bash
aws dynamodb update-item \
  --table-name subordinated-debt-criteria \
  --key '{"id":{"S":"1"},"tipo":{"S":"Local"}}' \
  --update-expression "SET resolucion_sbs = :new_text" \
  --expression-attribute-values '{":new_text":{"S":"Nuevo texto actualizado..."}}' \
  --region us-east-1 \
  --profile protecso-qa-admin
```

### Re-cargar todos los criterios
Si necesitas recargar desde cero:

```bash
# 1. Vaciar tabla (opcional, cuidado!)
# 2. Re-ejecutar script de seed
node scripts/seed-subordinated-debt-criteria.js \
  --table subordinated-debt-criteria \
  --region us-east-1 \
  --profile protecso-qa-admin
```

## Fuente de Datos

Los criterios provienen del archivo Excel analizado:
- **Archivo:** `Criterios para autorizar deuda subordinada – Anexo IBK.xlsx`
- **Conversión:** `Criterios_Basilea_SBS_Contrato_Cumplimiento.json`
- **Fecha:** 2026-01-09
- **Normativa:** 
  - Basilea III (International regulatory framework)
  - Resolución SBS N° 3950-2022 (Perú)

## Siguiente Paso

Una vez cargada esta tabla, el siguiente paso es crear la tabla `subordinated-debt-compliance-analysis` para almacenar los resultados de validación automática de contratos.
