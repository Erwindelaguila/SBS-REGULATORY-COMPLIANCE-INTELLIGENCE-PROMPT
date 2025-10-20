import {SourceProcessRepository} from "../domain/ports/source_process.repository";
import {DynamoDBDocumentClient, QueryCommand, QueryCommandInput} from "@aws-sdk/lib-dynamodb";
import {Logger} from "pino";

export class DynSourceProcessRepositoryImpl implements SourceProcessRepository {
    constructor(
        private readonly dynamoDBDocumentClient: DynamoDBDocumentClient,
        private readonly tableName: string,
        private readonly logger: Logger,
    ) {
    }


    async getSources(sources: string[]): Promise<string[]> {
        const finallyResponses=[]
        for (const source of sources) {
            let ExclusiveStartKey: Record<string, any> | undefined;

            do {
                const input: QueryCommandInput = {
                    TableName: this.tableName,
                    KeyConditionExpression: "#source = :src",
                    ExpressionAttributeNames: {
                        "#source": "source", // alias por ser reservada
                    },
                    ExpressionAttributeValues: {
                        ":src": source,
                    },
                    ExclusiveStartKey,
                };

                const resp = await this.dynamoDBDocumentClient.send(new QueryCommand(input));
                ExclusiveStartKey = resp.LastEvaluatedKey;


                for (const item of resp.Items ?? []) {
                    // Verifica si tiene type === 'processed' y existe el campo data
                    this.logger.debug({ source, item }, "Encontrado item con type=processed y data presente");
                    finallyResponses.push(this.solveKey(item))

                }
            } while (ExclusiveStartKey);

            this.logger.debug({ source }, "No se encontró item con type=processed");
        }
        return finallyResponses.filter(f=>f!=="")
    }

    private solveKey(item:any):string {
        if (item?.type === "letter-analysis.processed" && item?.data) {
            console.log("data",item?.data)
            return item.data?.key ?? "";
        }
        return "";
    }


}
