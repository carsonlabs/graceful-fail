import { describe, it, expect, vi } from "vitest";
import { PostgresAdapter } from "../src/adapters/postgres.js";
import { PgVectorAdapter } from "../src/adapters/pgvector.js";
import { PineconeAdapter } from "../src/adapters/pinecone.js";

describe("PostgresAdapter", () => {
  it("issues parameterized DELETE for each rule and aggregates rowCount", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values: values ?? [] });
        if (sql.includes('"messages"')) return { rowCount: 4 };
        if (sql.includes('"profiles"')) return { rowCount: 1 };
        return { rowCount: 0 };
      },
    };
    const adapter = new PostgresAdapter({
      client,
      rules: [
        { table: "messages", userIdColumn: "user_id" },
        { table: "profiles", userIdColumn: "id" },
      ],
    });
    const result = await adapter.erase({ userId: "u_42" });
    expect(result.status).toBe("success");
    expect(result.recordsAffected).toBe(5);
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toBe('DELETE FROM "messages" WHERE "user_id" = $1');
    expect(calls[0].values).toEqual(["u_42"]);
    expect(calls[1].sql).toBe('DELETE FROM "profiles" WHERE "id" = $1');
  });

  it("supports schema-qualified tables", async () => {
    const client = { query: vi.fn(async () => ({ rowCount: 0 })) };
    const adapter = new PostgresAdapter({
      client,
      rules: [{ table: "messages", userIdColumn: "user_id", schema: "app" }],
    });
    await adapter.erase({ userId: "u" });
    expect(client.query).toHaveBeenCalledWith(
      'DELETE FROM "app"."messages" WHERE "user_id" = $1',
      ["u"],
    );
  });

  it("rejects unsafe identifiers (SQL injection guard)", () => {
    const client = { query: async () => ({ rowCount: 0 }) };
    expect(() => new PostgresAdapter({
      client,
      rules: [{ table: "users; DROP TABLE users--", userIdColumn: "id" }],
    })).toThrow(/Unsafe SQL identifier/);
  });

  it("requires at least one rule", () => {
    const client = { query: async () => ({ rowCount: 0 }) };
    expect(() => new PostgresAdapter({ client, rules: [] })).toThrow();
  });
});

describe("PgVectorAdapter", () => {
  it("issues a single DELETE on the configured table", async () => {
    const client = { query: vi.fn(async () => ({ rowCount: 11 })) };
    const adapter = new PgVectorAdapter({
      client,
      table: "embeddings",
      userIdColumn: "user_id",
    });
    const result = await adapter.erase({ userId: "u_42" });
    expect(result.status).toBe("success");
    expect(result.recordsAffected).toBe(11);
    expect(client.query).toHaveBeenCalledWith(
      'DELETE FROM "embeddings" WHERE "user_id" = $1',
      ["u_42"],
    );
  });
});

describe("PineconeAdapter", () => {
  it("calls deleteMany with the metadata filter for the userId", async () => {
    const calls: Array<{ filter: Record<string, unknown> }> = [];
    const index = {
      deleteMany: async (arg: { filter: Record<string, unknown> }) => {
        calls.push(arg);
      },
    };
    const adapter = new PineconeAdapter({ index, metadataKey: "user_id" });
    const result = await adapter.erase({ userId: "u_42" });
    expect(result.status).toBe("success");
    expect(calls).toHaveLength(1);
    expect(calls[0].filter).toEqual({ user_id: { $eq: "u_42" } });
  });
});
