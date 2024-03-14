import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { GenericContainer, StartedTestContainer } from "testcontainers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PartitionKey, SortKey } from "./ddbTypes";
import { Tsynamo } from "./index";

interface DDB {
  myTable: {
    userId: PartitionKey<string>;
    dataTimestamp: SortKey<number>;
    somethingElse: number;
    someBoolean: boolean;
  };
}

const DDB_PORT = 8000 as const;

describe("tsynamo", () => {
  let ddbClient: DynamoDBDocumentClient;
  let ddbContainer: StartedTestContainer;
  let tsynamoClient: Tsynamo<DDB>;

  beforeAll(async () => {
    ddbContainer = await new GenericContainer("amazon/dynamodb-local")
      .withReuse()
      .withExposedPorts(DDB_PORT)
      .start();

    const containerUrl = `http://${ddbContainer.getHost()}:${ddbContainer.getMappedPort(
      DDB_PORT
    )}`;

    const opts = {
      endpoint: containerUrl,
      region: "us-east-1",
      credentials: {
        accessKeyId: "xxxxx",
        secretAccessKey: "xxxxx",
      },
    };

    ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient(opts));
  }, 60000);

  beforeEach(async () => {
    await setupTestDatabase(ddbClient);

    tsynamoClient = new Tsynamo<DDB>({
      ddbClient,
    });
  });

  describe("getItemFrom", async () => {
    it("handles a basic get item command", async () => {
      const data = await tsynamoClient
        .getItemFrom("myTable")
        .keys({
          userId: TEST_ITEM_2.userId,
          dataTimestamp: TEST_ITEM_2.dataTimestamp,
        })
        .execute();

      expect(data).toEqual(TEST_ITEM_2);
    });

    it("handles selecting specific attributes", async () => {
      const data = await tsynamoClient
        .getItemFrom("myTable")
        .keys({
          userId: TEST_ITEM_1.userId,
          dataTimestamp: TEST_ITEM_1.dataTimestamp,
        })
        .consistentRead(true)
        .attributes(["somethingElse", "someBoolean"])
        .execute();

      expect(data?.somethingElse).toBe(TEST_ITEM_1.somethingElse);
      expect(data?.someBoolean).toBe(TEST_ITEM_1.someBoolean);
      expect(Object.keys(data!).length).toBe(2);
    });
  });

  describe("query", () => {
    it("handles a query with a simple KeyCondition", async () => {
      const data = await tsynamoClient
        .query("myTable")
        .keyCondition("userId", "=", TEST_ITEM_1.userId)
        .execute();

      expect(data?.length).toBe(4);
      expect(data).toMatchSnapshot();
    });

    it("handles a KeyCondition with BETWEEN expression", async () => {
      const data = await tsynamoClient
        .query("myTable")
        .keyCondition("userId", "=", "123")
        .keyCondition("dataTimestamp", "BETWEEN", 150, 500)
        .execute();

      expect(data).toMatchSnapshot();
    });

    it("handles a query with a FilterExpression", async () => {
      const data = await tsynamoClient
        .query("myTable")
        .keyCondition("userId", "=", TEST_ITEM_1.userId)
        .filterExpression("someBoolean", "=", true)
        .execute();

      expect(data?.length).toBe(2);
      expect(data).toMatchSnapshot();
    });

    it("handles a query with multiple expressions", async () => {
      const data = await tsynamoClient
        .query("myTable")
        .keyCondition("userId", "=", "123")
        .keyCondition("dataTimestamp", "<", 888)
        .filterExpression("someBoolean", "=", true)
        .filterExpression("somethingElse", "<", 0)
        .execute();

      expect(data).toMatchSnapshot();
    });

    it("handles a query with a nested FilterExpression", async () => {
      const data = await tsynamoClient
        .query("myTable")
        .keyCondition("userId", "=", "123")
        .keyCondition("dataTimestamp", "<", 888)
        .filterExpression("somethingElse", "<", 2)
        .orNestedFilterExpression((qb) =>
          qb
            .filterExpression("someBoolean", "=", true)
            .filterExpression("somethingElse", "=", 2)
        )
        .execute();

      expect(data).toMatchSnapshot();
    });
  });
});

const TEST_ITEM_1 = {
  userId: "123",
  dataTimestamp: 222,
  somethingElse: 2,
  someBoolean: true,
};

const TEST_ITEM_2 = {
  userId: "321",
  dataTimestamp: 333,
  somethingElse: 3,
  someBoolean: false,
};

const TEST_ITEM_3 = {
  userId: "123",
  dataTimestamp: 333,
  somethingElse: 10,
  someBoolean: false,
};

const TEST_ITEM_4 = {
  userId: "123",
  dataTimestamp: 999,
  somethingElse: 0,
  someBoolean: false,
};

const TEST_ITEM_5 = {
  userId: "123",
  dataTimestamp: 111,
  somethingElse: -5,
  someBoolean: true,
};

/**
 * Re-create a DynamoDB table called "myTable" with some test data.
 */
const setupTestDatabase = async (client: DynamoDBDocumentClient) => {
  const deleteTableCommand = new DeleteTableCommand({
    TableName: "myTable",
  });

  try {
    await client.send(deleteTableCommand);
  } catch (e: unknown) {
    if (!(e instanceof ResourceNotFoundException)) {
      throw e;
    }
  }

  const createTableCommand = new CreateTableCommand({
    TableName: "myTable",
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "dataTimestamp", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      {
        AttributeName: "userId",
        AttributeType: "S",
      },
      {
        AttributeName: "dataTimestamp",
        AttributeType: "N",
      },
    ],
    BillingMode: "PAY_PER_REQUEST",
  });

  await client.send(createTableCommand);

  await client.send(
    new PutCommand({
      TableName: "myTable",
      Item: TEST_ITEM_1,
    })
  );

  await client.send(
    new PutCommand({
      TableName: "myTable",
      Item: TEST_ITEM_2,
    })
  );

  await client.send(
    new PutCommand({
      TableName: "myTable",
      Item: TEST_ITEM_3,
    })
  );

  await client.send(
    new PutCommand({
      TableName: "myTable",
      Item: TEST_ITEM_4,
    })
  );

  await client.send(
    new PutCommand({
      TableName: "myTable",
      Item: TEST_ITEM_5,
    })
  );
};
