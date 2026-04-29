import { describe, it, expect } from "vitest";
import { selfheal } from "@selfheal/sdk";

interface Row {
  user_id: string;
  [k: string]: unknown;
}

class FakePg {
  tables: Record<string, Row[]> = {};
  seed(table: string, rows: Row[]) {
    this.tables[table] = rows;
  }
  async query(sql: string, values?: unknown[]) {
    const m = /DELETE FROM "(?:[^"]+"\.")?([^"]+)" WHERE "([^"]+)" = \$1/.exec(sql);
    if (!m) throw new Error(`unrecognized SQL: ${sql}`);
    const [, table, col] = m;
    const userId = (values ?? [])[0];
    const before = this.tables[table] ?? [];
    const after = before.filter((r) => r[col] !== userId);
    this.tables[table] = after;
    return { rowCount: before.length - after.length };
  }
}

class FakePineconeIndex {
  vectors: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  seed(vectors: Array<{ id: string; metadata: Record<string, unknown> }>) {
    this.vectors = vectors;
  }
  async deleteMany({ filter }: { filter: Record<string, unknown> }) {
    const [key, cond] = Object.entries(filter)[0];
    const target = (cond as { $eq: unknown }).$eq;
    this.vectors = this.vectors.filter((v) => v.metadata[key] !== target);
  }
}

describe("selfheal SDK — end-to-end erasure cascade", () => {
  it("cascades across postgres + pgvector + pinecone, signs the audit chain, and produces a verifiable proof", async () => {
    const pg = new FakePg();
    pg.seed("messages", [
      { user_id: "u_42", body: "hello" },
      { user_id: "u_42", body: "world" },
      { user_id: "u_99", body: "untouched" },
    ]);
    pg.seed("profiles", [
      { user_id: "u_42", name: "Jane" },
      { user_id: "u_99", name: "Other" },
    ]);
    pg.seed("embeddings", [
      { user_id: "u_42", vector: "..." },
      { user_id: "u_42", vector: "..." },
      { user_id: "u_42", vector: "..." },
      { user_id: "u_99", vector: "..." },
    ]);

    const pinecone = new FakePineconeIndex();
    pinecone.seed([
      { id: "v1", metadata: { user_id: "u_42" } },
      { id: "v2", metadata: { user_id: "u_42" } },
      { id: "v3", metadata: { user_id: "u_99" } },
    ]);

    const sh = selfheal({
      apiKey: "sk_test_" + "x".repeat(40),
    });

    sh.compliance.configure({
      postgres: {
        client: pg,
        rules: [
          { table: "messages", userIdColumn: "user_id" },
          { table: "profiles", userIdColumn: "user_id" },
        ],
      },
      pgvector: {
        client: pg,
        table: "embeddings",
        userIdColumn: "user_id",
      },
      pinecone: {
        index: pinecone,
        metadataKey: "user_id",
      },
    });

    const result = await sh.compliance.eraseUser({
      userId: "u_42",
      reason: "gdpr_article_17",
      requestedBy: "jane@example.com",
    });

    expect(result.status).toBe("success");
    expect(result.adapterResults).toHaveLength(3);
    expect(result.adapterResults.map((r) => r.adapter).sort()).toEqual([
      "pgvector",
      "pinecone",
      "postgres",
    ]);

    expect(pg.tables.messages).toEqual([{ user_id: "u_99", body: "untouched" }]);
    expect(pg.tables.profiles).toEqual([{ user_id: "u_99", name: "Other" }]);
    expect(pg.tables.embeddings).toEqual([{ user_id: "u_99", vector: "..." }]);
    expect(pinecone.vectors.map((v) => v.id)).toEqual(["v3"]);

    const postgresResult = result.adapterResults.find((r) => r.adapter === "postgres")!;
    expect(postgresResult.recordsAffected).toBe(3);
    const pgvectorResult = result.adapterResults.find((r) => r.adapter === "pgvector")!;
    expect(pgvectorResult.recordsAffected).toBe(3);

    const proof = await sh.compliance.getDeletionProof({ userId: "u_42" });
    expect(proof.userId).toBe("u_42");
    expect(proof.status).toBe("success");
    expect(proof.rootHash).toBe(result.auditRootHash);
    expect(proof.signedReceipt).toBeTruthy();
    expect(proof.signatureAlgorithm).toBe("HMAC-SHA256");
    expect(proof.auditEntries.length).toBeGreaterThan(0);
    expect(proof.auditEntries[0].event).toBe("cascade.started");
    expect(proof.auditEntries[proof.auditEntries.length - 1].event).toBe("cascade.completed");

    const verification = sh.compliance.verifyProof(proof);
    expect(verification.valid).toBe(true);

    const tampered = {
      ...proof,
      auditEntries: proof.auditEntries.map((e, i) =>
        i === 1 ? { ...e, payload: { ...e.payload, recordsAffected: 99999 } } : e,
      ),
    };
    expect(sh.compliance.verifyProof(tampered).valid).toBe(false);
  });

  it("returns partial status when one adapter fails and still produces a signed proof", async () => {
    const pg = new FakePg();
    pg.seed("messages", [{ user_id: "u_1", body: "x" }]);

    const broken = {
      deleteMany: async () => {
        throw new Error("pinecone unreachable");
      },
    };

    const sh = selfheal({ apiKey: "sk_test_" + "y".repeat(40) });
    sh.compliance.configure({
      postgres: { client: pg, rules: [{ table: "messages", userIdColumn: "user_id" }] },
      pinecone: { index: broken, metadataKey: "user_id" },
      // biome: cascade.retries=0 keeps test fast and exercises immediate-fail path
    });

    const result = await sh.compliance.eraseUser({ userId: "u_1" });
    expect(result.status).toBe("partial");
    const proof = await sh.compliance.getDeletionProof({ userId: "u_1" });
    expect(sh.compliance.verifyProof(proof).valid).toBe(true);
    expect(proof.adapterResults.find((r) => r.adapter === "pinecone")!.status).toBe("failed");
    expect(proof.adapterResults.find((r) => r.adapter === "postgres")!.status).toBe("success");
  });

  it("throws on getDeletionProof for an unknown userId", async () => {
    const sh = selfheal({ apiKey: "sk_test_" + "z".repeat(40) });
    sh.compliance.configure({
      postgres: { client: new FakePg(), rules: [{ table: "messages", userIdColumn: "user_id" }] },
    });
    await expect(sh.compliance.getDeletionProof({ userId: "nope" })).rejects.toThrow();
  });
});
