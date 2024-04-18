import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { TransactionNode } from "../nodes/transactionNode";
import { QueryCompiler } from "../queryCompiler";
import { PutItemQueryBuilder } from "./putItemQueryBuilder";
import { DeleteItemQueryBuilder } from "./deleteItemQueryBuilder";
import { UpdateItemQueryBuilder } from "./updateItemQueryBuilder";

export interface TransactionBuilderInterface<DDB> {
  /**
   * TODO: ConditionCheck
   */
  addItem(item: {
    Put?: PutItemQueryBuilder<DDB, any, any>;
    Delete?: DeleteItemQueryBuilder<DDB, any, any>;
    Update?: UpdateItemQueryBuilder<DDB, any, any>;
  }): void;

  execute(): Promise<void>;
}

export class TransactionBuilder<DDB>
  implements TransactionBuilderInterface<DDB>
{
  readonly #props: TransactionBuilderProps;

  constructor(props: TransactionBuilderProps) {
    this.#props = props;
  }

  addItem(item: {
    Put?: PutItemQueryBuilder<DDB, any, any>;
    Delete?: DeleteItemQueryBuilder<DDB, any, any>;
    Update?: UpdateItemQueryBuilder<DDB, any, any>;
  }) {
    this.#props.node.transactItems.push({
      kind: "TransactItemNode",
      Put: item.Put?.node,
      Delete: item.Delete?.node,
      Update: item.Update?.node,
    });
  }

  async execute() {
    const transactionCommand = this.#props.queryCompiler.compile(
      this.#props.node
    );

    await this.#props.ddbClient.send(transactionCommand);
  }
}

interface TransactionBuilderProps {
  readonly node: TransactionNode;
  readonly ddbClient: DynamoDBDocumentClient;
  readonly queryCompiler: QueryCompiler;
}
