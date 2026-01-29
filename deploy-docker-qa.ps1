
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Despliegue COMPLETO con Docker a QA" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

# Configuracion QA
$STACK_NAME = "suptech-regulatory-compliance-prompt"
$REGION = "us-east-1"
$PROFILE = "protecso-qa-admin"

# Obtener Account ID
Write-Host "[0/6] Obteniendo Account ID..." -ForegroundColor Yellow
$ACCOUNT_ID = (aws sts get-caller-identity --profile $PROFILE --query Account --output text)
Write-Host "Account ID: $ACCOUNT_ID" -ForegroundColor Green
Write-Host ""

# Variables ECR
$ECR_REPO = "suptechregulatorycompliancepromptdf6aa69a/processdocumentsfunctioncdc0a880repo"
$ECR_URI = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO"

# 1. Build del codigo TypeScript primero
Write-Host "[1/6] Construyendo codigo TypeScript..." -ForegroundColor Yellow
Set-Location -Path "functions/process-documents"
npm install
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Error en build TypeScript" -ForegroundColor Red
    Set-Location -Path "../.."
    exit 1
}

Set-Location -Path "../.."
Write-Host "[OK] Build TypeScript completado" -ForegroundColor Green
Write-Host ""

# 2. Login a ECR
Write-Host "[2/6] Autenticando con ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $REGION --profile $PROFILE | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Error en login ECR" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Autenticado en ECR" -ForegroundColor Green
Write-Host ""

# 3. Build de imagen Docker
Write-Host "[3/6] Construyendo imagen Docker (formato Docker v2)..." -ForegroundColor Yellow
Set-Location -Path "functions/process-documents"


$env:DOCKER_BUILDKIT = "0"
docker build --platform linux/amd64 -t process-documents:latest .

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Error en docker build" -ForegroundColor Red
    Set-Location -Path "../.."
    exit 1
}

Set-Location -Path "../.."
Write-Host "[OK] Imagen Docker construida" -ForegroundColor Green
Write-Host ""

# 4. Tag de la imagen
Write-Host "[4/6] Taggeando imagen..." -ForegroundColor Yellow
docker tag process-documents:latest ${ECR_URI}:latest

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Error en docker tag" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Imagen taggeada" -ForegroundColor Green
Write-Host ""

# 5. Push a ECR
Write-Host "[5/6] Subiendo imagen a ECR..." -ForegroundColor Yellow
docker push ${ECR_URI}:latest

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Error en docker push" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Imagen subida a ECR" -ForegroundColor Green
Write-Host ""

# 6. Obtener nuevo digest
Write-Host "[6/6] Obteniendo nuevo digest SHA256..." -ForegroundColor Yellow
$NEW_DIGEST = (aws ecr describe-images --repository-name $ECR_REPO --image-ids imageTag=latest --profile $PROFILE --region $REGION --query 'imageDetails[0].imageDigest' --output text)

Write-Host "[OK] Nuevo digest: $NEW_DIGEST" -ForegroundColor Green
Write-Host ""

# Mostrar instrucciones finales
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "SIGUIENTE PASO: Actualizar template.yaml" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Abre: template.yaml" -ForegroundColor Yellow
Write-Host "2. Ve a la linea 290 (ProcessDocumentsFunction -> ImageUri)" -ForegroundColor Yellow
Write-Host "3. Reemplaza el digest SHA256 actual con:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   $NEW_DIGEST" -ForegroundColor Green
Write-Host ""
Write-Host "4. Ejecuta: .\deploy-cloudformation-qa.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "La nueva imagen URI completa es:" -ForegroundColor Cyan
Write-Host "$ECR_URI@$NEW_DIGEST" -ForegroundColor White
Write-Host ""
