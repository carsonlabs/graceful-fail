import * as core from "@actions/core";

interface ProxySuccessResponse {
  statusCode: number;
  body: string;
  intercepted: false;
}

interface ProxyInterceptedResponse {
  statusCode: number;
  body: string;
  intercepted: true;
  errorAnalysis: string;
  isRetriable: boolean;
  fixSuggestion: string;
}

type ProxyResponse = ProxySuccessResponse | ProxyInterceptedResponse;

async function run(): Promise<void> {
  try {
    // Read inputs
    const apiKey = core.getInput("api-key", { required: true });
    const url = core.getInput("url", { required: true });
    const method = core.getInput("method") || "POST";
    const body = core.getInput("body");
    const headersInput = core.getInput("headers");
    const failOnError = core.getBooleanInput("fail-on-error");

    // Build proxy request headers
    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Destination-URL": url,
      "X-Destination-Method": method,
    };

    // Parse and forward additional headers
    if (headersInput) {
      try {
        const additionalHeaders = JSON.parse(headersInput);
        proxyHeaders["X-Destination-Headers"] = JSON.stringify(additionalHeaders);
      } catch {
        core.warning("Failed to parse 'headers' input as JSON. Skipping additional headers.");
      }
    }

    // Build proxy request body
    const proxyBody: Record<string, unknown> = {};
    if (body) {
      try {
        proxyBody.body = JSON.parse(body);
      } catch {
        // If body is not valid JSON, send as raw string
        proxyBody.body = body;
      }
    }

    core.info(`Proxying ${method} request to ${url} via Graceful Fail...`);

    // Make the proxy request using native fetch (Node 20)
    const response = await fetch("https://selfheal.dev/api/proxy", {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify(proxyBody),
    });

    if (!response.ok && response.status >= 500) {
      throw new Error(
        `Graceful Fail proxy returned ${response.status}: ${response.statusText}`
      );
    }

    const data: ProxyResponse = await response.json();

    // Set common outputs
    core.setOutput("status-code", data.statusCode.toString());
    core.setOutput("intercepted", data.intercepted.toString());
    core.setOutput("response", data.body);

    if (data.intercepted) {
      // Error was intercepted — set error analysis outputs
      core.setOutput("error-analysis", data.errorAnalysis);
      core.setOutput("is-retriable", data.isRetriable.toString());
      core.setOutput("fix-suggestion", data.fixSuggestion);

      // Log the fix suggestion as a warning
      core.warning(
        `Graceful Fail intercepted an error (${data.statusCode}):\n` +
          `Analysis: ${data.errorAnalysis}\n` +
          `Retriable: ${data.isRetriable}\n` +
          `Fix: ${data.fixSuggestion}`
      );

      // Fail the step if configured and error is not retriable
      if (failOnError && !data.isRetriable) {
        core.setFailed(
          `Non-retriable error (${data.statusCode}): ${data.fixSuggestion}`
        );
      }
    } else {
      core.info(`Request succeeded with status ${data.statusCode}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Graceful Fail action failed: ${message}`);
  }
}

run();
