/**
 * Script para eliminar TODOS los datos de deuda subordinada.
 * 
 * Elimina:
 * 1. Todos los registros de subordinated-debt-analysis (resultados de análisis)
 * 2. Archivos en s3://processed-supervisory-records-qa/analysis/ (JSONs + TXTs de cláusulas)
 * 3. PDFs de contratos en s3://supervisory-records-qa/ (carpetas de contratos de deuda subordinada)
 * 4. Registros de deuda subordinada en supervisory-records (metadata)
 * 
 * NO elimina:
 * - SubordinatedDebtCriteriaTable (seeds de criterios)
 * - Datos de WARRANTY o LETTER
 * 
 * Uso:
 * node scripts/cleanup-subordinated-debt.js --region us-east-1 --profile protecso-qa-admin
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");

const args = process.argv.slice(2);
const region = args[args.indexOf("--region") + 1] || "us-east-1";
const profile = args[args.indexOf("--profile") + 1] || "default";
const dryRun = args.includes("--dry-run");

process.env.AWS_PROFILE = profile;
process.env.AWS_SDK_LOAD_CONFIG = "1";

const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region });

const ANALYSIS_TABLE = "subordinated-debt-analysis";
const SUPERVISORY_TABLE = "supervisory-records";
const PROCESSED_BUCKET = "processed-supervisory-records-qa";
const RECORDS_BUCKET = "supervisory-records-qa";

console.log(`🗑️  Limpieza de datos de Deuda Subordinada`);
console.log(`   Región: ${region}`);
console.log(`   Perfil: ${profile}`);
console.log(`   Modo: ${dryRun ? "🔍 DRY RUN (no borra nada)" : "⚠️  ELIMINACIÓN REAL"}`);
console.log("");

async function deleteAllFromTable(tableName, keySchema) {
  console.log(`\n📋 Tabla: ${tableName}`);
  
  let lastKey = undefined;
  let totalDeleted = 0;
  
  do {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey,
    }));
    
    if (!scanResult.Items || scanResult.Items.length === 0) break;
    
    for (const item of scanResult.Items) {
      const key = {};
      for (const k of keySchema) {
        key[k] = item[k];
      }
      
      if (!dryRun) {
        await docClient.send(new DeleteCommand({
          TableName: tableName,
          Key: key,
        }));
      }
      totalDeleted++;
    }
    
    lastKey = scanResult.LastEvaluatedKey;
    process.stdout.write(`   Eliminados: ${totalDeleted}\r`);
  } while (lastKey);
  
  console.log(`   ✅ ${totalDeleted} registros ${dryRun ? "(serían eliminados)" : "eliminados"}`);
  return totalDeleted;
}

async function deleteSubordinatedFromSupervisoryRecords() {
  console.log(`\n📋 Tabla: ${SUPERVISORY_TABLE} (solo registros de deuda subordinada)`);
  
  let lastKey = undefined;
  let totalDeleted = 0;
  let totalScanned = 0;
  
  do {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: SUPERVISORY_TABLE,
      ExclusiveStartKey: lastKey,
    }));
    
    if (!scanResult.Items || scanResult.Items.length === 0) break;
    totalScanned += scanResult.Items.length;
    
    for (const item of scanResult.Items) {
      // Solo eliminar registros de deuda subordinada
      const isSubordinated = 
        (item.type && typeof item.type === 'string' && item.type.includes("subordinated")) ||
        (item.application && item.application === "SUBORDINATED_DEBT") ||
        (item.data && typeof item.data === 'string' && item.data.includes("subordinated"));
      
      if (isSubordinated) {
        if (!dryRun) {
          // supervisory-records tiene pk "id" (string)
          const key = { id: item.id };
          if (item.sort_key !== undefined) key.sort_key = item.sort_key;
          if (item.sk !== undefined) key.sk = item.sk;
          if (item.tipo !== undefined && !key.sort_key && !key.sk) {
            // Try common sort key names
          }
          
          try {
            await docClient.send(new DeleteCommand({
              TableName: SUPERVISORY_TABLE,
              Key: key,
            }));
          } catch (e) {
            console.log(`   ⚠️  Error borrando ${item.id}: ${e.message}`);
          }
        }
        totalDeleted++;
      }
    }
    
    lastKey = scanResult.LastEvaluatedKey;
    process.stdout.write(`   Escaneados: ${totalScanned}, subordinados encontrados: ${totalDeleted}\r`);
  } while (lastKey);
  
  console.log(`   ✅ ${totalDeleted} registros subordinados ${dryRun ? "(serían eliminados)" : "eliminados"} de ${totalScanned} total`);
  return totalDeleted;
}

async function deleteS3Prefix(bucket, prefix) {
  console.log(`\n📂 S3: s3://${bucket}/${prefix}`);
  
  let totalDeleted = 0;
  let continuationToken = undefined;
  
  do {
    const listResult = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    
    if (!listResult.Contents || listResult.Contents.length === 0) break;
    
    if (!dryRun) {
      // Delete in batches of 1000 (S3 limit)
      const objects = listResult.Contents.map(obj => ({ Key: obj.Key }));
      
      for (let i = 0; i < objects.length; i += 1000) {
        const batch = objects.slice(i, i + 1000);
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch },
        }));
      }
    }
    
    totalDeleted += listResult.Contents.length;
    continuationToken = listResult.NextContinuationToken;
    process.stdout.write(`   Eliminados: ${totalDeleted}\r`);
  } while (continuationToken);
  
  console.log(`   ✅ ${totalDeleted} archivos ${dryRun ? "(serían eliminados)" : "eliminados"}`);
  return totalDeleted;
}

async function findAndDeleteSubordinatedDebtS3Files() {
  console.log(`\n📂 S3: s3://${RECORDS_BUCKET}/ (buscando carpetas de deuda subordinada)`);
  
  // Primero necesitamos los recordKeys de deuda subordinada
  // Los obtenemos de subordinated-debt-analysis
  let lastKey = undefined;
  const recordKeys = new Set();
  
  do {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: ANALYSIS_TABLE,
      ProjectionExpression: "#s",
      ExpressionAttributeNames: { "#s": "source" },
      ExclusiveStartKey: lastKey,
    }));
    
    if (scanResult.Items) {
      for (const item of scanResult.Items) {
        if (item.source) recordKeys.add(item.source);
      }
    }
    lastKey = scanResult.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`   Encontradas ${recordKeys.size} carpetas de contratos`);
  
  let totalDeleted = 0;
  
  for (const key of recordKeys) {
    // Cada contrato tiene su carpeta en S3 con el recordKey como prefix
    let continuationToken = undefined;
    
    do {
      const listResult = await s3Client.send(new ListObjectsV2Command({
        Bucket: RECORDS_BUCKET,
        Prefix: key,
        ContinuationToken: continuationToken,
      }));
      
      if (!listResult.Contents || listResult.Contents.length === 0) break;
      
      if (!dryRun) {
        const objects = listResult.Contents.map(obj => ({ Key: obj.Key }));
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: RECORDS_BUCKET,
          Delete: { Objects: objects },
        }));
      }
      
      totalDeleted += listResult.Contents.length;
      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);
  }
  
  console.log(`   ✅ ${totalDeleted} archivos de contratos ${dryRun ? "(serían eliminados)" : "eliminados"}`);
  return totalDeleted;
}

async function main() {
  try {
    console.log("════════════════════════════════════════════════");
    console.log("  PASO 1: Obtener recordKeys antes de borrar");
    console.log("════════════════════════════════════════════════");
    
    // Paso 1: Primero borrar PDFs de contratos en S3 (necesitamos los keys de la tabla analysis)
    await findAndDeleteSubordinatedDebtS3Files();
    
    console.log("\n════════════════════════════════════════════════");
    console.log("  PASO 2: Borrar análisis de S3");
    console.log("════════════════════════════════════════════════");
    
    // Paso 2: Borrar archivos de análisis en S3
    await deleteS3Prefix(PROCESSED_BUCKET, "analysis/");
    
    console.log("\n════════════════════════════════════════════════");
    console.log("  PASO 3: Borrar tabla subordinated-debt-analysis");
    console.log("════════════════════════════════════════════════");
    
    // Paso 3: Borrar tabla de análisis
    await deleteAllFromTable(ANALYSIS_TABLE, ["source", "id"]);
    
    console.log("\n════════════════════════════════════════════════");
    console.log("  PASO 4: Borrar metadata de supervisory-records");
    console.log("════════════════════════════════════════════════");
    
    // Paso 4: Borrar registros subordinados de supervisory-records
    await deleteSubordinatedFromSupervisoryRecords();
    
    console.log("\n\n🎉 Limpieza completada!");
    if (dryRun) {
      console.log("⚠️  Fue un DRY RUN. Ejecuta sin --dry-run para borrar de verdad.");
    }
    
  } catch (error) {
    console.error(`\n❌ ERROR:`, error);
    process.exit(1);
  }
}

main();
