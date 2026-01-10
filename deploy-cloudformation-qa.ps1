# Despliegue directo usando AWS CloudFormation para QA (bypass SAM CLI)
# NO requiere permisos ECR porque no reconstruye imagenes Docker
# Despliega los cambios de WARRANTY (conversationHistory + documentGenerator)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Despliegue WARRANTY a QA usando CloudFormation CLI" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

# Configuracion QA
$STACK_NAME = "suptech-regulatory-compliance-prompt"
$REGION = "us-east-1"
$PROFILE = "protecso-qa-admin"
$TEMPLATE_FILE = ".aws-sam/build/template.yaml"

# 1. Build
Write-Host "[1/4] Construyendo funciones..." -ForegroundColor Yellow
sam build --cached

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Error en build" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Build completado" -ForegroundColor Green
Write-Host ""

# 2. Package (subir artefactos a S3, sin tocar ECR)
Write-Host "[2/4] Empaquetando y subiendo artefactos a S3..." -ForegroundColor Yellow

$PACKAGED_TEMPLATE = ".aws-sam/build/packaged-template.yaml"
$S3_BUCKET = "aws-sam-cli-managed-default-samclisourcebucket-g1i8vkbqprcs"

aws cloudformation package `
    --template-file $TEMPLATE_FILE `
    --s3-bucket $S3_BUCKET `
    --s3-prefix "suptech-regulatory-compliance-prompt" `
    --output-template-file $PACKAGED_TEMPLATE `
    --region $REGION `
    --profile $PROFILE

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Error en package" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Artefactos empaquetados" -ForegroundColor Green
Write-Host ""

# 3. Crear changeset
Write-Host "[3/4] Creando changeset..." -ForegroundColor Yellow

$CHANGESET_NAME = "warranty-deploy-$(Get-Date -Format 'yyyyMMddHHmmss')"

# Parametros del stack QA
$PARAMETERS = @(
    "ParameterKey=PromptsTableName,ParameterValue=system-prompts",
    "ParameterKey=WarrantyAnalysisTableName,ParameterValue=preferred-warranty-analysis",
    "ParameterKey=LetterAnalysisTableName,ParameterValue=letter-analysis",
    "ParameterKey=BedrockModelId,ParameterValue=us.anthropic.claude-sonnet-4-20250514-v1:0",
    "ParameterKey=RecordsBucketName,ParameterValue=supervisory-records-qa",
    "ParameterKey=CsvAnalysisBucketName,ParameterValue=supervisory-records-csv-analysis-qa",
    "ParameterKey=ProcessedRecordsBucketName,ParameterValue=processed-supervisory-records-qa",
    "ParameterKey=WarrantyReportsBucketName,ParameterValue=warranty-analysis-reports-qa",
    "ParameterKey=LetterReportsBucketName,ParameterValue=letter-analysis-reports-qa",
    "ParameterKey=SupervisoryRecordsTableName,ParameterValue=supervisory-records",
    "ParameterKey=SupervisoryRecordsMetadataTableName,ParameterValue=supervisory-records-metadata",
    "ParameterKey=InteractionWebSocketQueueUrl,ParameterValue=https://sqs.us-east-1.amazonaws.com/058264428218/interaction-websocket-queue",
    "ParameterKey=SupervisoryRecordsStreamArn,ParameterValue=arn:aws:dynamodb:us-east-1:058264428218:table/supervisory-records/stream/2025-08-20T06:07:26.305",
    "ParameterKey=PdfJsLayer,ParameterValue=arn:aws:lambda:us-east-1:058264428218:layer:pdfjs-dist-layer:1",
    "ParameterKey=StageName,ParameterValue=qa",
    "ParameterKey=KafkaBrokers,ParameterValue=98.82.186.188:9092",
    "ParameterKey=WarrantyRRTableName,ParameterValue=warranty-regulatory-reports",
    "ParameterKey=WarrantyITTableName,ParameterValue=warranty-internal-tables",
    "ParameterKey=LetterRRTableName,ParameterValue=letter-regulatory-reports",
    "ParameterKey=LetterITTableName,ParameterValue=letter-internal-tables",
    "ParameterKey=SubordinatedDebtCriteriaTableName,ParameterValue=subordinated-debt-criteria"
)

aws cloudformation create-change-set `
    --stack-name $STACK_NAME `
    --change-set-name $CHANGESET_NAME `
    --template-body file://$PACKAGED_TEMPLATE `
    --parameters $PARAMETERS `
    --capabilities CAPABILITY_IAM `
    --region $REGION `
    --profile $PROFILE

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Error creando changeset" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Changeset creado: $CHANGESET_NAME" -ForegroundColor Green
Write-Host ""

# Esperar a que el changeset este listo (con timeout automatico)
Write-Host "Esperando a que el changeset este listo..." -ForegroundColor Yellow

aws cloudformation wait change-set-create-complete `
    --stack-name $STACK_NAME `
    --change-set-name $CHANGESET_NAME `
    --region $REGION `
    --profile $PROFILE

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Changeset fallo o timeout esperando creacion" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Changeset listo para ejecutar" -ForegroundColor Green

# Mostrar cambios
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "CAMBIOS PROPUESTOS:" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

aws cloudformation describe-change-set `
    --stack-name $STACK_NAME `
    --change-set-name $CHANGESET_NAME `
    --region $REGION `
    --profile $PROFILE `
    --query 'Changes[*].[Type,ResourceChange.Action,ResourceChange.LogicalResourceId,ResourceChange.ResourceType]' `
    --output table

Write-Host ""
Write-Host "IMPORTANTE: Verifica los cambios antes de ejecutar" -ForegroundColor Yellow
Write-Host "- RegulatoryCompliancePromptFunction: UPDATE (conversationHistory + documentGenerator)" -ForegroundColor Cyan
Write-Host "- GenerateWarrantyDocumentFunction: Sin cambios" -ForegroundColor Cyan
Write-Host "- ProcessDocumentsFunction: Sin cambios (usa imagen ECR existente)" -ForegroundColor Cyan
Write-Host "- Otras funciones: Sin cambios" -ForegroundColor Cyan
Write-Host ""

# Preguntar confirmacion
$confirmation = Read-Host "Ejecutar este changeset en QA? (y/n)"

if ($confirmation -ne 'y') {
    Write-Host "[SKIP] Despliegue cancelado por usuario" -ForegroundColor Yellow
    
    # Eliminar changeset
    aws cloudformation delete-change-set `
        --stack-name $STACK_NAME `
        --change-set-name $CHANGESET_NAME `
        --region $REGION `
        --profile $PROFILE
    
    exit 0
}

# 4. Ejecutar changeset
Write-Host ""
Write-Host "[4/4] Ejecutando changeset en QA..." -ForegroundColor Yellow

aws cloudformation execute-change-set `
    --stack-name $STACK_NAME `
    --change-set-name $CHANGESET_NAME `
    --region $REGION `
    --profile $PROFILE

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Error ejecutando changeset" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Changeset ejecutado" -ForegroundColor Green
Write-Host ""
Write-Host "Esperando a que el stack se actualice..." -ForegroundColor Yellow

# Esperar a que complete (con timeout de 15 minutos)
aws cloudformation wait stack-update-complete `
    --stack-name $STACK_NAME `
    --region $REGION `
    --profile $PROFILE

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "[OK] DESPLIEGUE QA EXITOSO" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Cambios desplegados:" -ForegroundColor Cyan
    Write-Host "- WARRANTY conversationHistory support" -ForegroundColor White
    Write-Host "- WARRANTY document generator integration" -ForegroundColor White
    Write-Host "- System prompts: warranty-chat + warranty-document-generator" -ForegroundColor White
    Write-Host ""
    
    # Obtener outputs
    Write-Host "Outputs del stack:" -ForegroundColor Cyan
    aws cloudformation describe-stacks `
        --stack-name $STACK_NAME `
        --region $REGION `
        --profile $PROFILE `
        --query 'Stacks[0].Outputs' `
        --output table
        
} else {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "[ERROR] DESPLIEGUE QA FALLO" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host ""
    
    # Mostrar eventos de error
    Write-Host "Ultimos eventos del stack:" -ForegroundColor Yellow
    aws cloudformation describe-stack-events `
        --stack-name $STACK_NAME `
        --region $REGION `
        --profile $PROFILE `
        --max-items 10 `
        --query 'StackEvents[?ResourceStatus==``CREATE_FAILED`` || ResourceStatus==``UPDATE_FAILED``].[LogicalResourceId,ResourceStatusReason]' `
        --output table
}
