# regulatory-compliance-intelligence-services-prompt
Regulatory Compliance Intelligence Service prompt managment

1. gets the question and files ids from the request body
2. search the records in the table with the ids
3. get the processedFileKey field from the found records
4. use the processedFileKey to get the files from S3
5. extract text from files (.txt)
6. use the text to prompt the AI integration with bedrock
7. return the AI response and the files keys used in the response
  
### File Responses

#### File: InformeN006712022SGNCMACHYOpdf

- **Sender**: POMA PEREZ, JUAN DE DIOS
- **Receiver**: GERENCIA MANCOMUNADA
- **Subject**: APROBACION DE GASTO PARA TASACIONES DE GARANTIAS
- **Response**: The document is an internal report requesting approval for expenses related to property valuations. The purpose is to update the guarantees in the database, which is expected to reduce provisions by approximately S/1,800,000.00. The estimated cost for 76 property valuations is approximately S/19,000.00.

### General Response

The document outlines a request for approval to incur expenses for property valuations. The goal is to update the guarantees in the database, which is expected to have a positive impact on reducing loan loss provisions by approximately S/1,800,000.00. The total estimated cost for 76 property valuations is around S/19,000.00.

| File | Sender | Receiver | Subject | Response |
| --- | --- | --- | --- | --- |
| InformeN006712022SGNCMACHYOpdf | POMA PEREZ, JUAN DE DIOS | GERENCIA MANCOMUNADA | APROBACION DE GASTO PARA TASACIONES DE GARANTIAS | The document is an internal report requesting approval for expenses related to property valuations. The purpose is to update the guarantees in the database, which is expected to reduce provisions by approximately S/1,800,000.00. The estimated cost for 76 property valuations is approximately S/19,000.00. |


| File | Sender | Receiver | Subject | Response |
|------|--------|----------|---------|----------|
| InformeN006712022SGNCMACHYOpdf | POMA PEREZ, JUAN DE DIOS | GERENCIA MANCOMUNADA | APROBACION DE GASTO PARA TASACIONES DE GARANTIAS | Official report requesting approval for expenses up to S/19,000.00 for property appraisals of 76 guarantees |
| unknownpdf | Not found in file | JOSÉ LUIS HUAMÁN APARCANA | Not found in file | Payroll receipt from Banco de Crédito del Perú for June 2023, showing net pay of S/6,015.80 for Backend Engineer |
| viewDanielCoyulaCVpdf | Not found in file | Not found in file | Not found in file | Professional resume for Daniel Coyula, Senior Flutter Engineer with 5+ years mobile development experience |