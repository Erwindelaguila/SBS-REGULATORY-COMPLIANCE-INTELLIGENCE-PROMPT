/**
 * Script para cargar criterios de Basilea III y Resolución SBS N° 3950-2022
 * en la tabla DynamoDB subordinated-debt-criteria
 * 
 * Uso:
 * node scripts/seed-subordinated-debt-criteria.js --table subordinated-debt-criteria --region us-east-1 --profile protecso-qa-admin
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require("fs");
const path = require("path");

// Parsear argumentos de línea de comandos
const args = process.argv.slice(2);
const tableName = args[args.indexOf("--table") + 1] || "subordinated-debt-criteria";
const region = args[args.indexOf("--region") + 1] || "us-east-1";
const profile = args[args.indexOf("--profile") + 1] || "default";

console.log(`📊 Iniciando carga de criterios regulatorios...`);
console.log(`   Tabla: ${tableName}`);
console.log(`   Región: ${region}`);
console.log(`   Perfil: ${profile}`);

// Configurar cliente DynamoDB
const client = new DynamoDBClient({ 
  region,
  ...(profile !== "default" && { 
    credentials: {
      // El perfil se toma de ~/.aws/credentials automáticamente
    }
  })
});
const docClient = DynamoDBDocumentClient.from(client);

// Leer archivo JSON con criterios
const criteriosFilePath = path.join(__dirname, "..", "..", "..", "Downloads", "Criterios_Basilea_SBS_Contrato_Cumplimiento.json");

if (!fs.existsSync(criteriosFilePath)) {
  console.error(`❌ ERROR: No se encontró el archivo de criterios en: ${criteriosFilePath}`);
  console.error(`   Por favor, coloca el archivo Criterios_Basilea_SBS_Contrato_Cumplimiento.json en la ubicación correcta.`);
  process.exit(1);
}

const criteriosData = JSON.parse(fs.readFileSync(criteriosFilePath, "utf-8"));

/**
 * Función para convertir criterios del JSON a items de DynamoDB
 */
function convertCriteriosToItems(criteriosData) {
  const items = [];
  
  for (const sheet of criteriosData.sheets) {
    const tipo = sheet.name; // "Local" o "Internacional"
    const criterios = sheet.criterios.filter(c => 
      c.id && // Tiene ID
      c.id !== "2" && // Excluir id="2" (es solo header "Maturity:")
      c.basilea && // Tiene criterio Basilea
      c.basilea.trim() !== "Maturity:" // No es header
    );
    
    criterios.forEach((criterio, index) => {
      items.push({
        id: criterio.id,
        tipo: tipo,
        orden: index + 1,
        basilea: criterio.basilea,
        resolucion_sbs: criterio.resolucion_sbs || "",
        resolucion_sbs_numero: sheet.resolucion_sbs_numero,
        basilea_header: sheet.basilea_header,
        resolucion_sbs_header: sheet.resolucion_sbs_header,
      });
    });
  }
  
  return items;
}

/**
 * Función para cargar items en DynamoDB en lotes de 25 (límite de BatchWriteItem)
 */
async function batchWriteItems(items) {
  const BATCH_SIZE = 25;
  let successCount = 0;
  let failureCount = 0;
  
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    
    const command = new BatchWriteCommand({
      RequestItems: {
        [tableName]: batch.map(item => ({
          PutRequest: {
            Item: item
          }
        }))
      }
    });
    
    try {
      const response = await docClient.send(command);
      
      // Verificar si hay items no procesados
      if (response.UnprocessedItems && response.UnprocessedItems[tableName]) {
        failureCount += response.UnprocessedItems[tableName].length;
        console.warn(`⚠️  ${response.UnprocessedItems[tableName].length} items no procesados en este lote`);
      } else {
        successCount += batch.length;
        console.log(`✅ Lote ${Math.floor(i / BATCH_SIZE) + 1} procesado: ${batch.length} items`);
      }
    } catch (error) {
      failureCount += batch.length;
      console.error(`❌ Error en lote ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
    }
  }
  
  return { successCount, failureCount };
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log(`\n🔄 Convirtiendo criterios del JSON...`);
    const items = convertCriteriosToItems(criteriosData);
    
    console.log(`   Total de criterios encontrados: ${items.length}`);
    console.log(`   Criterios por tipo:`);
    const localCount = items.filter(i => i.tipo === "Local").length;
    const internacionalCount = items.filter(i => i.tipo === "Internacional").length;
    console.log(`   - Local: ${localCount}`);
    console.log(`   - Internacional: ${internacionalCount}`);
    
    // Mostrar preview de los primeros 3 items
    console.log(`\n📋 Preview de criterios a cargar:`);
    items.slice(0, 3).forEach(item => {
      console.log(`   [${item.tipo}] Criterio ${item.id}: ${item.basilea.substring(0, 60)}...`);
    });
    
    console.log(`\n⏳ Cargando criterios en DynamoDB...`);
    const { successCount, failureCount } = await batchWriteItems(items);
    
    console.log(`\n✨ Carga completada:`);
    console.log(`   ✅ Éxito: ${successCount} criterios`);
    if (failureCount > 0) {
      console.log(`   ❌ Fallos: ${failureCount} criterios`);
      process.exit(1);
    } else {
      console.log(`\n🎉 Todos los criterios regulatorios fueron cargados exitosamente!`);
      console.log(`\n📊 Resumen de datos cargados:`);
      console.log(`   Tabla: ${tableName}`);
      console.log(`   Total: ${successCount} criterios`);
      console.log(`   Fuente: Basilea III + Resolución SBS N° 3950-2022`);
    }
    
  } catch (error) {
    console.error(`\n❌ ERROR FATAL:`, error);
    process.exit(1);
  }
}

// Ejecutar
main();
