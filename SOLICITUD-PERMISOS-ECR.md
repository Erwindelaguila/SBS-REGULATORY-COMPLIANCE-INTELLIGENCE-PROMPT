# Solicitud de Permisos ECR para Despliegue

## Información del Solicitante
- **Usuario**: erwin.pieers@protecso.com.pe
- **Cuenta AWS**: 891377295186 (SBS-DEV)
- **Rol Actual**: AWSReservedSSO_PermissionSetSBS-DEV_5045b3ed1c198ee0

## Solicitud
Agregar permisos de **Amazon Elastic Container Registry (ECR)** al rol actual para poder desplegar funciones Lambda basadas en imágenes Docker.

## Política Necesaria
**Opción 1 (Recomendada):** Adjuntar política AWS administrada:
```
AmazonEC2ContainerRegistryFullAccess
```
ARN: `arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess`

**Opción 2 (Mínimos permisos):** Crear política personalizada:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRPermissionsForSAMDeploy",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeRepositories",
        "ecr:DescribeImages",
        "ecr:ListImages"
      ],
      "Resource": "*"
    }
  ]
}
```

## Justificación
1. **Contexto**: Estoy desplegando la funcionalidad de WARRANTY (generación de documentos Word) a producción usando AWS SAM CLI
2. **Función afectada**: `ProcessDocumentsFunction` - función Lambda existente basada en imagen Docker
3. **Error actual**: 
   ```
   AccessDeniedException: User is not authorized to perform: ecr:GetAuthorizationToken
   ```
4. **Impacto**: Sin estos permisos, no puedo desplegar actualizaciones al stack CloudFormation `suptech-regulatory-compliance-prompt`

## Permisos Actuales del Rol
El rol ya tiene **FullAccess** a los siguientes servicios:
- ✅ Lambda (AWSLambda_FullAccess)
- ✅ CloudFormation (AWSCloudFormationFullAccess)
- ✅ DynamoDB (AmazonDynamoDBFullAccess)
- ✅ S3 (AmazonS3FullAccess)
- ✅ EC2 (AmazonEC2FullAccess)
- ✅ Bedrock (AmazonBedrockFullAccess)
- ✅ SQS, SSM, Cognito, CloudFront
- ❌ **ECR - FALTA**

## Seguridad
- ✅ **Es seguro**: ECR es solo un repositorio de imágenes Docker (equivalente a S3 para containers)
- ✅ **Necesario**: Requerido por AWS SAM CLI para desplegar funciones Lambda con imágenes Docker
- ✅ **Práctica estándar**: Todos los desarrolladores que usan SAM con Docker necesitan estos permisos
- ✅ **Mismo nivel**: Si ya tengo S3FullAccess, ECRFullAccess es del mismo nivel de riesgo

## Alternativa Temporal
Si no es posible otorgar permisos ECR, se puede:
1. Excluir ProcessDocumentsFunction del template temporalmente
2. Desplegar solo las nuevas funciones Node.js
3. Re-agregar ProcessDocumentsFunction después

Pero esto es **arriesgado** y **no recomendado** porque CloudFormation podría intentar eliminar ProcessDocumentsFunction.

## Urgencia
⚠️ **Media-Alta**: El desarrollo local funciona perfectamente, solo falta desplegar a producción DEV

## Contacto
Para cualquier duda sobre esta solicitud, contactar a: erwin.pieers@protecso.com.pe
