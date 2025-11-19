# Script de despliegue temporal - Solo actualiza funciones Node.js
# NO toca ProcessDocumentsFunction (requiere permisos ECR)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Despliegue WARRANTY sin reconstruir Docker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Build solo funciones Node.js
Write-Host "[1/5] Construyendo funciones Node.js..." -ForegroundColor Yellow
sam build --cached

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error en build" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build completado" -ForegroundColor Green
Write-Host ""

# 2. Crear changeset preview
Write-Host "[2/5] Creando changeset preview..." -ForegroundColor Yellow
Write-Host "IMPORTANTE: Verifica que ProcessDocumentsFunction dice 'Modify' NO 'Delete'" -ForegroundColor Yellow
Write-Host ""

# 3. Mostrar instrucciones
Write-Host "[3/5] INSTRUCCIONES:" -ForegroundColor Cyan
Write-Host "1. El siguiente comando creará un changeset" -ForegroundColor White
Write-Host "2. Verifica que ProcessDocumentsFunction NO sea DELETE" -ForegroundColor White
Write-Host "3. Si todo se ve bien, responde 'y' para continuar" -ForegroundColor White
Write-Host "4. Si ves DELETE en ProcessDocumentsFunction, responde 'n' y contacta al admin" -ForegroundColor White
Write-Host ""

# 4. Ejecutar deploy
Write-Host "[4/5] Ejecutando deploy..." -ForegroundColor Yellow
sam deploy

# 5. Verificar resultado
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✅ DESPLIEGUE EXITOSO" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "[5/5] Obteniendo URL de GenerateWarrantyDocumentFunction..." -ForegroundColor Yellow
    
    # Obtener URL de la nueva función
    aws cloudformation describe-stacks `
        --stack-name suptech-regulatory-compliance-prompt `
        --profile protecso-dev `
        --region us-east-1 `
        --query "Stacks[0].Outputs[?OutputKey=='GenerateWarrantyDocumentFunctionUrl'].OutputValue" `
        --output text
        
    Write-Host ""
    Write-Host "Guarda esta URL para generar documentos Word de WARRANTY" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "❌ DESPLIEGUE FALLÓ" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "CAUSA PROBABLE: Falta permiso ECR" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "SOLUCIÓN: Solicita al administrador AWS agregar la política:" -ForegroundColor Yellow
    Write-Host "  AmazonEC2ContainerRegistryFullAccess" -ForegroundColor White
    Write-Host ""
    Write-Host "Al rol: AWSReservedSSO_PermissionSetSBS-DEV_5045b3ed1c198ee0" -ForegroundColor White
}
