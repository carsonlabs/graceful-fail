import { ENV } from "./env";

// ── Claude (Anthropic) Native Provider ─────────────────────────────────────
// When ANTHROPIC_API_KEY is set, use Claude directly for better structured
// output support and to enable "hosted mode" (customers don't need their own key).

async function invokeClaude(params: InvokeParams, overrides?: LLMOverrides): Promise<InvokeResult> {
  const apiKey = overrides?.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = overrides?.model || process.env.LLM_MODEL || "claude-sonnet-4-6";

  // Convert messages: Claude uses top-level system, not system role in messages
  let systemPrompt = "";
  const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of params.messages) {
    const text = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.map(p => typeof p === "string" ? p : "text" in p ? p.text : "").join("\n")
        : "";
    if (msg.role === "system") {
      systemPrompt += (systemPrompt ? "\n\n" : "") + text;
    } else if (msg.role === "user" || msg.role === "assistant") {
      claudeMessages.push({ role: msg.role, content: text });
    }
  }

  // Build request body
  const body: Record<string, unknown> = {
    model,
    max_tokens: params.maxTokens || params.max_tokens || 4096,
    messages: claudeMessages,
  };
  // Use array format with cache_control — the system prompt (base + provider context)
  // is the same across all error analyses for a given provider, so caching saves ~90%
  if (systemPrompt) {
    body.system = [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }];
  }

  // Convert response_format to Claude's output_config
  const rf = params.responseFormat || params.response_format;
  if (rf && rf.type === "json_schema" && "json_schema" in rf) {
    body.output_config = {
      format: {
        type: "json_schema",
        schema: rf.json_schema.schema,
      },
    };
  }

  const baseUrl = overrides?.baseUrl || "https://api.anthropic.com";
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const result = await response.json() as {
    id: string;
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
    model: string;
    stop_reason: string;
  };

  const textContent = result.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text?: string }) => b.text ?? "")
    .join("");

  // Convert to OpenAI-compatible InvokeResult shape for compatibility
  return {
    id: result.id,
    created: Math.floor(Date.now() / 1000),
    model: result.model,
    choices: [{
      index: 0,
      message: { role: "assistant" as const, content: textContent },
      finish_reason: result.stop_reason === "end_turn" ? "stop" : result.stop_reason,
    }],
    usage: result.usage ? {
      prompt_tokens: result.usage.input_tokens,
      completion_tokens: result.usage.output_tokens,
      total_tokens: result.usage.input_tokens + result.usage.output_tokens,
    } : undefined,
  };
}

/** Whether to use Claude natively (hosted mode) vs OpenAI-compatible (BYOLLM) */
function shouldUseClaude(overrides?: LLMOverrides): boolean {
  // If the override points to a non-Anthropic base URL, use OpenAI path
  if (overrides?.baseUrl && !overrides.baseUrl.includes("anthropic")) return false;
  // If ANTHROPIC_API_KEY is set and no OpenAI key override, prefer Claude
  if (overrides?.apiKey) return false; // BYOLLM mode — use OpenAI path
  return !!process.env.ANTHROPIC_API_KEY;
}

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () => {
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com";
  return `${base.replace(/\/$/, "")}/v1/chat/completions`;
};

const getApiKey = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  return key;
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export interface LLMOverrides {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export async function invokeLLM(params: InvokeParams, overrides?: LLMOverrides): Promise<InvokeResult> {
  // Route to Claude when hosted mode is active (ANTHROPIC_API_KEY set, no BYOLLM override)
  if (shouldUseClaude(overrides)) {
    return invokeClaude(params, overrides);
  }

  const apiKey = overrides?.apiKey || getApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: overrides?.model || process.env.LLM_MODEL || "gpt-4o-mini",
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 4096;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const apiUrl = overrides?.baseUrl
    ? `${overrides.baseUrl.replace(/\/$/, "")}/v1/chat/completions`
    : resolveApiUrl();

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}
