import type { Adapter, AdapterResult, EraseInput } from "../types.js";

export interface PineconeIndexLike {
  deleteMany(arg: { filter: Record<string, unknown> }): Promise<unknown>;
  describeIndexStats?(): Promise<{ totalRecordCount?: number; namespaces?: Record<string, { recordCount?: number }> }>;
}

export interface PineconeAdapterOptions {
  index: PineconeIndexLike;
  metadataKey: string;
  name?: string;
}

export class PineconeAdapter implements Adapter {
  readonly name: string;

  constructor(private readonly opts: PineconeAdapterOptions) {
    if (!opts.metadataKey) throw new Error("PineconeAdapter requires metadataKey");
    this.name = opts.name ?? "pinecone";
  }

  async erase(input: EraseInput): Promise<Omit<AdapterResult, "adapter" | "startedAt" | "finishedAt" | "attempts">> {
    const filter = { [this.opts.metadataKey]: { $eq: input.userId } };
    await this.opts.index.deleteMany({ filter });
    return {
      status: "success",
      recordsAffected: -1,
      details: { metadataKey: this.opts.metadataKey, filter },
    };
  }
}
