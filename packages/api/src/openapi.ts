/**
 * OpenAPI 3.1 fragments for the v2 compliance module. Imported and merged into
 * the project-wide openApiSpec.ts so the four compliance endpoints show up in
 * Swagger UI alongside the v1 surface.
 */
export function complianceOpenApiPaths(): Record<string, unknown> {
  const bearer = [{ bearerAuth: [] }];
  return {
    "/api/compliance/erase": {
      post: {
        operationId: "complianceEraseUser",
        summary: "Erase a user across all configured data stores",
        description:
          "Cascades a GDPR/CCPA right-to-erasure request across every configured adapter (Postgres, pgvector, Pinecone, custom). Returns a per-adapter breakdown plus the audit-log root hash. Idempotent on already-erased users.",
        tags: ["Compliance"],
        security: bearer,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EraseRequest" },
              example: {
                user_id: "u_42",
                reason: "gdpr_article_17",
                requested_by: "jane@example.com",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Cascade completed (status may be 'success' or 'partial').",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CascadeResult" } },
            },
          },
          "400": { description: "Invalid request body." },
          "401": { description: "Missing or invalid API key." },
          "500": { description: "Cascade failed unexpectedly." },
        },
      },
    },
    "/api/compliance/proof/{userId}": {
      get: {
        operationId: "complianceGetProof",
        summary: "Get a signed deletion proof",
        description:
          "Returns the cryptographically signed deletion proof for a previously-erased user. Includes the full HMAC-chained audit log, per-adapter results, root hash, and a base64 signed receipt envelope suitable for compliance auditors.",
        tags: ["Compliance"],
        security: bearer,
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Signed proof.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/DeletionProof" } },
            },
          },
          "404": { description: "No deletion record for this user." },
        },
      },
    },
    "/api/compliance/proof/{userId}.pdf": {
      get: {
        operationId: "complianceGetProofPdf",
        summary: "Download the deletion proof as a signed PDF receipt",
        description:
          "Same proof as /proof/{userId} but rendered as a printable PDF for compliance officers and auditors. The crypto trust anchor is still the root hash + signed receipt embedded in the PDF.",
        tags: ["Compliance"],
        security: bearer,
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "PDF receipt (application/pdf).",
            content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
          },
          "404": { description: "No deletion record for this user." },
        },
      },
    },
    "/api/compliance/requests": {
      get: {
        operationId: "complianceListRequests",
        summary: "List recorded deletion requests",
        description:
          "Lists every deletion request the server has recorded. Filterable by cascade status. v1 is synchronous, so 'pending' is rare in practice — completed records dominate.",
        tags: ["Compliance"],
        security: bearer,
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["all", "success", "partial", "failed"] },
          },
        ],
        responses: {
          "200": {
            description: "List of deletion request summaries.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    count: { type: "integer" },
                    requests: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CascadeSummary" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/compliance/status/{userId}": {
      get: {
        operationId: "complianceCheckStatus",
        summary: "Check the latest known compliance status for a user",
        description:
          "Returns whether the user has been erased and, if so, whether every adapter reported success on the most recent run.",
        tags: ["Compliance"],
        security: bearer,
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Compliance status.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ComplianceStatus" } },
            },
          },
        },
      },
    },
  };
}

export function complianceOpenApiSchemas(): Record<string, unknown> {
  return {
    EraseRequest: {
      type: "object",
      required: ["user_id"],
      properties: {
        user_id: { type: "string", description: "Internal user identifier to erase" },
        reason: {
          type: "string",
          enum: ["gdpr_article_17", "ccpa_delete", "ca_delete_act", "user_request", "internal"],
          description: "Legal basis for the erasure",
        },
        requested_by: {
          type: "string",
          description: "Who initiated the request — recorded in the audit log",
        },
        metadata: {
          type: "object",
          additionalProperties: true,
          description: "Free-form metadata captured in the audit trail",
        },
      },
    },
    AdapterResult: {
      type: "object",
      properties: {
        adapter: { type: "string" },
        status: { type: "string", enum: ["success", "failed", "partial"] },
        recordsAffected: {
          type: "integer",
          description: "-1 indicates the backend (e.g. Pinecone deleteMany) does not return a count",
        },
        startedAt: { type: "string", format: "date-time" },
        finishedAt: { type: "string", format: "date-time" },
        attempts: { type: "integer" },
        error: { type: "string" },
        details: { type: "object", additionalProperties: true },
      },
    },
    CascadeResult: {
      type: "object",
      properties: {
        userId: { type: "string" },
        status: { type: "string", enum: ["success", "partial", "failed"] },
        startedAt: { type: "string", format: "date-time" },
        completedAt: { type: "string", format: "date-time" },
        reason: { type: "string" },
        requestedBy: { type: "string" },
        adapterResults: { type: "array", items: { $ref: "#/components/schemas/AdapterResult" } },
        auditRootHash: {
          type: "string",
          description: "SHA-256 hash of the final audit-log entry; the chain anchor",
        },
      },
    },
    CascadeSummary: {
      type: "object",
      properties: {
        userId: { type: "string" },
        status: { type: "string" },
        startedAt: { type: "string", format: "date-time" },
        completedAt: { type: "string", format: "date-time" },
        rootHash: { type: "string" },
        adapterCount: { type: "integer" },
        adapters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              status: { type: "string" },
              recordsAffected: { type: "integer" },
            },
          },
        },
      },
    },
    AuditEntry: {
      type: "object",
      properties: {
        index: { type: "integer" },
        timestamp: { type: "string", format: "date-time" },
        event: { type: "string" },
        userId: { type: "string" },
        prevHash: { type: "string" },
        payload: { type: "object", additionalProperties: true },
        payloadHash: { type: "string" },
        entryHash: { type: "string" },
        signature: {
          type: "string",
          description: "HMAC-SHA256 of the entry hash, hex-encoded",
        },
      },
    },
    DeletionProof: {
      type: "object",
      properties: {
        userId: { type: "string" },
        status: { type: "string" },
        startedAt: { type: "string", format: "date-time" },
        completedAt: { type: "string", format: "date-time" },
        adapterResults: { type: "array", items: { $ref: "#/components/schemas/AdapterResult" } },
        auditEntries: { type: "array", items: { $ref: "#/components/schemas/AuditEntry" } },
        rootHash: { type: "string" },
        signedReceipt: { type: "string", description: "Base64-encoded signed envelope" },
        signatureAlgorithm: { type: "string", example: "HMAC-SHA256" },
      },
    },
    ComplianceStatus: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        erased: { type: "boolean" },
        compliant: { type: "boolean" },
        status: { type: "string", enum: ["success", "partial", "failed", "unknown"] },
        completedAt: { type: "string", format: "date-time" },
        rootHash: { type: "string" },
        failedAdapters: { type: "array", items: { type: "string" } },
      },
    },
  };
}

export const complianceOpenApiTag = {
  name: "Compliance",
  description:
    "Right-to-erasure cascade across configured data stores (Postgres, pgvector, Pinecone) with a tamper-evident HMAC-chained audit log and signed PDF receipt.",
};
