/**
 * Normalize Engine — LLM-powered API response normalization.
 *
 * Takes a raw API response + target JSON schema, uses the LLM to transform
 * the response into the exact target format. Returns compliance score,
 * token savings estimate, and the normalized data.
 *
 * Reuses the existing invokeLLM pipeline from _core/llm.ts.
 */

import { invokeLLM } from "./_core/llm";

// --- Types ---

export interface NormalizeInput {
  /** Raw response body from the target API */
  rawResponse: unknown;
  /** Target JSON schema the agent wants the response in */
  targetSchema: Record<string, unknown>;
  /** Original response size in characters (for token savings calc) */
  rawResponseSize: number;
}

export interface NormalizeResult {
  /** Whether normalization was performed */
  wasNormalized: boolean;
  /** The normalized data matching the target schema */
  normalizedData: unknown;
  /** 0-100 score of how well the raw response already matched the schema */
  schemaComplianceScore: number;
  /** Estimated tokens saved by using normalized vs raw response */
  tokenSavingsEstimate: number;
  /** Suggested fixes if the raw data had issues */
  suggestedFixes: string[];
}

// --- Compliance Check (no LLM, free) ---

/**
 * Quick heuristic check of how well raw data matches a target schema.
 * No LLM call — just structural comparison. Returns 0-100 score.
 */
export function quickComplianceCheck(
  rawResponse: unknown,
  targetSchema: Record<string, unknown>,
): number {
  if (typeof rawResponse !== "object" || rawResponse === null) return 0;
  const raw = rawResponse as Record<string, unknown>;

  // Extract expected properties from schema
  const schemaProps = targetSchema.properties as Record<string, unknown> | undefined;
  if (!schemaProps) return 50; // Can't determine without properties

  const expectedKeys = Object.keys(schemaProps);
  if (expectedKeys.length === 0) return 100;

  // Check how many expected keys exist in the raw response
  // Also check nested — flatten the raw response keys
  const rawKeys = new Set(flattenKeys(raw));
  let matched = 0;
  for (const key of expectedKeys) {
    if (rawKeys.has(key)) matched++;
  }

  const keyScore = (matched / expectedKeys.length) * 100;

  // Check required fields
  const required = (targetSchema.required as string[]) ?? [];
  let requiredMatched = 0;
  for (const key of required) {
    if (raw[key] !== undefined) requiredMatched++;
  }
  const requiredScore = required.length > 0
    ? (requiredMatched / required.length) * 100
    : 100;

  // Weighted: required fields matter more
  return Math.round(requiredScore * 0.6 + keyScore * 0.4);
}

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(key); // Add just the leaf key
    keys.push(fullKey); // Add the full path
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    }
  }
  return keys;
}

// --- Token Savings Estimate ---

/** Rough estimate of tokens: ~4 chars per token */
function estimateTokens(data: unknown): number {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return Math.ceil(str.length / 4);
}

// --- LLM Normalization ---

const NORMALIZE_SYSTEM_PROMPT = `You are an API response normalizer for autonomous AI agents.

Your job: take a raw API response and transform it to EXACTLY match a target JSON schema.

CRITICAL RULES:
- Output MUST be valid JSON matching the target schema exactly
- Field names must match the schema exactly (rename if needed)
- Field types must match (convert strings to numbers, etc.)
- Remove all fields NOT in the target schema (agents pay per token — trim waste)
- If a required field is missing from the raw data, use null or a sensible default
- For arrays: normalize each element to match the items schema
- Preserve actual data values — only change structure, names, and types
- NEVER invent data that isn't in the raw response
- Be aggressive about trimming — agents want minimal, schema-compliant JSON

Respond with ONLY the normalized JSON object. No markdown, no explanation, no wrapping.`;

export async function normalizeResponse(input: NormalizeInput): Promise<NormalizeResult> {
  const { rawResponse, targetSchema, rawResponseSize } = input;

  // Quick compliance check first (free, no LLM)
  const complianceScore = quickComplianceCheck(rawResponse, targetSchema);

  // If already highly compliant (95+), skip normalization
  if (complianceScore >= 95) {
    return {
      wasNormalized: false,
      normalizedData: rawResponse,
      schemaComplianceScore: complianceScore,
      tokenSavingsEstimate: 0,
      suggestedFixes: [],
    };
  }

  // Call LLM to normalize
  const userMessage = `## Raw API Response
${JSON.stringify(rawResponse, null, 2).slice(0, 8000)}

## Target Schema
${JSON.stringify(targetSchema, null, 2).slice(0, 4000)}

Transform the raw response to match the target schema exactly. Return ONLY the normalized JSON.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: NORMALIZE_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : null;
    if (!content) throw new Error("Empty LLM response");

    const normalizedData = JSON.parse(content);

    // Calculate token savings
    const rawTokens = estimateTokens(rawResponse);
    const normalizedTokens = estimateTokens(normalizedData);
    const tokenSavingsEstimate = Math.max(0, rawTokens - normalizedTokens);

    // Post-normalization compliance check
    const postComplianceScore = quickComplianceCheck(normalizedData, targetSchema);

    // Generate suggested fixes
    const suggestedFixes: string[] = [];
    if (complianceScore < 50) {
      suggestedFixes.push("Raw response structure significantly differs from target schema. Consider updating your API call parameters.");
    }
    if (tokenSavingsEstimate > 100) {
      suggestedFixes.push(`Normalization saved ~${tokenSavingsEstimate} tokens. The raw API returns ${Math.round((tokenSavingsEstimate / rawTokens) * 100)}% unnecessary data for your schema.`);
    }

    return {
      wasNormalized: true,
      normalizedData,
      schemaComplianceScore: postComplianceScore,
      tokenSavingsEstimate,
      suggestedFixes,
    };
  } catch (err) {
    // Normalization failed — return raw response with low score
    return {
      wasNormalized: false,
      normalizedData: rawResponse,
      schemaComplianceScore: complianceScore,
      tokenSavingsEstimate: 0,
      suggestedFixes: [
        `Normalization failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

/** Classify normalization complexity for pricing */
export function classifyNormalizeComplexity(
  rawResponseSize: number,
  schemaComplexity: number,
): "simple" | "moderate" | "complex" {
  // Schema complexity = number of properties
  if (rawResponseSize < 1000 && schemaComplexity < 10) return "simple";
  if (rawResponseSize < 5000 && schemaComplexity < 30) return "moderate";
  return "complex";
}
