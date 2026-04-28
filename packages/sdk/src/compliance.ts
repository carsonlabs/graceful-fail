import {
  AuditLog,
  CascadeEngine,
  InMemoryAuditStore,
  PgVectorAdapter,
  PineconeAdapter,
  PostgresAdapter,
  buildDeletionProof,
  type Adapter,
  type AuditStore,
  type CascadeOptions,
  type CascadeResult,
  type DeletionProof,
  type EraseReason,
  type PgClientLike,
  type PineconeIndexLike,
  type PostgresRule,
} from "../../core/src/index.js";

export interface PostgresConfig {
  client: PgClientLike;
  rules: PostgresRule[];
}

export interface PgVectorConfig {
  client: PgClientLike;
  table: string;
  userIdColumn: string;
  schema?: string;
}

export interface PineconeConfig {
  index: PineconeIndexLike;
  metadataKey: string;
}

export interface ComplianceConfig {
  postgres?: PostgresConfig;
  pgvector?: PgVectorConfig;
  pinecone?: PineconeConfig;
  custom?: Adapter[];
}

export interface SelfhealOptions {
  apiKey: string;
  auditSecret?: string;
  auditStore?: AuditStore;
  cascade?: CascadeOptions;
}

export interface EraseUserInput {
  userId: string;
  reason?: EraseReason;
  requestedBy?: string;
  metadata?: Record<string, unknown>;
}

interface CascadeRecord {
  cascade: CascadeResult;
  config: ComplianceConfig;
}

class ComplianceClient {
  private config: ComplianceConfig = {};
  private readonly audit: AuditLog;
  private readonly cascadeOpts: CascadeOptions;
  private readonly history = new Map<string, CascadeRecord>();

  constructor(opts: SelfhealOptions) {
    if (!opts.apiKey) throw new Error("selfheal: apiKey is required");
    const secret = opts.auditSecret ?? deriveSecretFromApiKey(opts.apiKey);
    const store = opts.auditStore ?? new InMemoryAuditStore();
    this.audit = new AuditLog(store, secret);
    this.cascadeOpts = opts.cascade ?? {};
  }

  configure(config: ComplianceConfig): void {
    this.config = config;
  }

  private buildAdapters(): Adapter[] {
    const adapters: Adapter[] = [];
    if (this.config.postgres) {
      adapters.push(new PostgresAdapter(this.config.postgres));
    }
    if (this.config.pgvector) {
      adapters.push(new PgVectorAdapter(this.config.pgvector));
    }
    if (this.config.pinecone) {
      adapters.push(new PineconeAdapter(this.config.pinecone));
    }
    if (this.config.custom) {
      adapters.push(...this.config.custom);
    }
    if (adapters.length === 0) {
      throw new Error("selfheal: no adapters configured. Call compliance.configure() first.");
    }
    return adapters;
  }

  async eraseUser(input: EraseUserInput): Promise<CascadeResult> {
    if (!input.userId) throw new Error("eraseUser: userId is required");
    const adapters = this.buildAdapters();
    const engine = new CascadeEngine(adapters, this.audit, this.cascadeOpts);
    const result = await engine.erase(input);
    this.history.set(input.userId, { cascade: result, config: this.config });
    return result;
  }

  async getDeletionProof(input: { userId: string }): Promise<DeletionProof> {
    const record = this.history.get(input.userId);
    if (!record) {
      throw new Error(`No deletion record found for userId=${input.userId}`);
    }
    const entries = await this.audit.list({ userId: input.userId });
    return buildDeletionProof({
      cascade: record.cascade,
      auditEntries: entries,
      audit: this.audit,
    });
  }

  verifyProof(proof: DeletionProof): { valid: boolean; reason?: string } {
    const chain = this.audit.verify(proof.auditEntries);
    if (!chain.valid) return { valid: false, reason: chain.reason };
    const receipt = this.audit.verifyReceipt(proof.signedReceipt);
    if (!receipt.valid) return { valid: false, reason: "receipt_invalid" };
    return { valid: true };
  }
}

export interface SelfhealClient {
  compliance: ComplianceClient;
}

export function selfheal(opts: SelfhealOptions): SelfhealClient {
  return { compliance: new ComplianceClient(opts) };
}

function deriveSecretFromApiKey(apiKey: string): string {
  const padded = apiKey.length >= 32 ? apiKey : apiKey.padEnd(32, "x");
  return padded;
}
