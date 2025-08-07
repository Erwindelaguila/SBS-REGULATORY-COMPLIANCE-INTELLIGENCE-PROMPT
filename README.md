# regulatory-compliance-intelligence-services-prompt
Regulatory Compliance Intelligence Service prompt managment

1. gets the question and files ids from the request body
2. search the records in the table with the ids
3. get the processedFileKey field from the found records
4. use the processedFileKey to get the files from S3
5. extract text from files (.txt)
6. use the text to prompt the AI integration with bedrock
7. return the AI response and the files keys used in the response