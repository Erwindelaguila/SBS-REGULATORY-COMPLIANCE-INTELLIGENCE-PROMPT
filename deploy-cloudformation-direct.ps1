# Despliegue directo usando AWS CloudFormation (bypass SAM CLI)
# NO requiere permisos ECR porque no reconstruye imagenes Docker

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Despliegue WARRANTY usando CloudFormation CLI directamente" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

# Configuracion
$STACK_NAME = "suptech-regulatory-compliance-prompt"
$REGION = "us-east-1"
$PROFILE = "protecso-dev"
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
$S3_BUCKET = "aws-sam-cli-managed-default-samclisourcebucket-qtgovvlujnht"

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

# Parametros del stack
$PARAMETERS = @(
    "ParameterKey=PromptsTableName,ParameterValue=system-prompts",
    "ParameterKey=WarrantyAnalysisTableName,ParameterValue=preferred-warranty-analysis",
    "ParameterKey=LetterAnalysisTableName,ParameterValue=letter-analysis",
    "ParameterKey=BedrockModelId,ParameterValue=us.anthropic.claude-sonnet-4-20250514-v1:0",
    "ParameterKey=RecordsBucketName,ParameterValue=supervisory-records",
    "ParameterKey=CsvAnalysisBucketName,ParameterValue=supervisory-records-csv-analysis",
    "ParameterKey=ProcessedRecordsBucketName,ParameterValue=processed-supervisory-records",
    "ParameterKey=WarrantyReportsBucketName,ParameterValue=warranty-analysis-reports",
    "ParameterKey=LetterReportsBucketName,ParameterValue=letter-analysis-reports",
    "ParameterKey=SupervisoryRecordsTableName,ParameterValue=supervisory-records",
    "ParameterKey=InteractionWebSocketQueueUrl,ParameterValue=https://sqs.us-east-1.amazonaws.com/891377295186/interaction-websocket-queue",
    "ParameterKey=SupervisoryRecordsStreamArn,ParameterValue=arn:aws:dynamodb:us-east-1:891377295186:table/supervisory-records/stream/2025-08-11T07:18:45.417",
    "ParameterKey=PdfJsLayer,ParameterValue=arn:aws:lambda:us-east-1:891377295186:layer:pdfjs-dist-layer:1",
    "ParameterKey=StageName,ParameterValue=develop",
    "ParameterKey=KafkaBrokers,ParameterValue=34.236.156.4:9092",
    "ParameterKey=WarrantyRRTableName,ParameterValue=processed-warranty-regulatory-reports",
    "ParameterKey=WarrantyITTableName,ParameterValue=processed-warranty-internal-tables",
    "ParameterKey=LetterRRTableName,ParameterValue=processed-bank-guarantee-regulatory-reports",
    "ParameterKey=LetterITTableName,ParameterValue=processed-bank-guarantee-internal-tables"
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
Write-Host "IMPORTANTE: Verifica que ProcessDocumentsFunction NO sea DELETE" -ForegroundColor Yellow
Write-Host ""

# Preguntar confirmacion
$confirmation = Read-Host "Ejecutar este changeset? (y/n)"

if ($confirmation -ne 'y') {
    Write-Host "[ERROR] Despliegue cancelado" -ForegroundColor Red
    
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
Write-Host "[4/4] Ejecutando changeset..." -ForegroundColor Yellow

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
    Write-Host "[OK] DESPLIEGUE EXITOSO" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
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
    Write-Host "[ERROR] DESPLIEGUE FALLO" -ForegroundColor Red
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
