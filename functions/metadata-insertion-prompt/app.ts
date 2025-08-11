import { DynamoDBStreamEvent } from 'aws-lambda';


export const handler = async (_: DynamoDBStreamEvent) => {
  return { 
    statusCode: 200, 
    body: JSON.stringify({
      message: 'Metadata Insertion Prompt Function',
    })
  };
};