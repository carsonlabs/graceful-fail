---
title: Why Your AI Agent Keeps Retrying the Same Broken API Call (And How to Fix It)
published: true
tags: ai, python, langchain, webdev
cover_image:
---

It is 3 AM. Your LangChain agent has been running an overnight data migration, pulling records from a CRM and pushing them into your warehouse. You wake up, check the logs, and find this: 4,200 identical failed requests to the same endpoint. The agent hit a 422 validation error on the first call, could not figure out what went wrong, and spent six hours retrying the exact same malformed payload. Your API budget is gone. The migration moved zero records.

If you have built production agents that call external APIs, you have lived some version of this. The agent works in testing, passes your eval suite, and then falls apart the moment a real API returns an error it was not expecting.

This is not a prompting problem. It is an architectural one.

## Why Agents Cannot Read Error Messages

HTTP error responses were designed for human developers staring at a terminal. Consider what a typical CRM returns when you send a bad payload:

```json
{
  "status": 422,
  "error": {
    "code": "validation_error",
    "message": "Unprocessable Entity: 'email' is a required property",
    "details": [
      {
        "loc": ["body", "email"],
        "msg": "field required",
        "type": "value_error.missing"
      }
    ]
  }
}
```

A human developer reads this and immediately knows: add an `email` field. But an LLM-powered agent sees a blob of JSON. Depending on the model, the prompt, and the agent framework, it might:

- Retry with the identical payload, hoping the server will change its mind
- Hallucinate a fix that makes the payload worse
- Give up and return a failure to the user
- Strip fields instead of adding them

The fundamental issue is that the error format does not match what agents need. Agents need three things: **is this retriable**, **what category of failure is this**, and **what specific changes will fix the request**. HTTP error responses provide none of those in a consistent, machine-readable way.

## The Four Error Patterns That Kill Agents

Not all API errors are the same, but agents treat them all the same way: retry and hope. Here is why that fails for each category.

### Validation Errors (422)

The API is telling you the payload is wrong. Maybe a required field is missing, a value has the wrong type, or a string exceeds the max length. The agent retries with the same payload. Same error. Retries again. Same error. It will never succeed because the problem is in the request, not the server.

```
POST /v1/contacts  {"name": "Jane Smith", "company": "Acme"}
--> 422: email is required

POST /v1/contacts  {"name": "Jane Smith", "company": "Acme"}
--> 422: email is required

POST /v1/contacts  {"name": "Jane Smith", "company": "Acme"}
--> 422: email is required
```

Three retries, three identical failures, three wasted API calls.

### Auth Errors (401/403)

The API key is expired, the token is invalid, or the agent does not have permission for this endpoint. No amount of retrying will fix this. The agent needs to escalate to a human or refresh credentials through a different flow entirely. But it does not know that, so it keeps trying.

### Rate Limits (429)

The agent is sending too many requests. The correct response is to back off and wait. Instead, most agent retry loops fire immediately, sending even more requests and making the rate limit worse. Some APIs return a `Retry-After` header, but agents rarely parse it.

### Server Errors (500/503)

This is the one case where blind retry actually makes sense. The server is temporarily broken, and the request might succeed if you wait and try again. But agents do not distinguish this from the other three categories. They retry 422s and 500s with equal enthusiasm.

The result: agents waste retries on errors that will never self-resolve, and sometimes give up on errors that would have resolved with a short wait.

## What Agents Actually Need

Instead of raw HTTP error JSON, agents need a structured signal that answers three questions:

1. **Should I retry this?** A boolean. If `false`, do not send the same request again.
2. **What kind of problem is this?** A category: `validation_error`, `auth_error`, `rate_limit`, `server_error`, `not_found`.
3. **What specific changes will fix it?** Plain language instructions that an LLM can act on, plus structured data about which fields to add, remove, or change.

Here is what that looks like in practice:

```
API ERROR (HTTP 422, category: validation_error)
Retriable: False
Explanation: The request body is missing the required 'email' field.
Fix: Add an 'email' field with a valid email address string to the request body.
Add fields: {'email': 'string (valid email address)'}
Remove fields: []
```

An agent reading this knows: do not retry as-is, add an email field, then try again. One clean retry instead of five blind ones.

## The Proxy Pattern

The cleanest way to give agents structured errors is a proxy layer that sits between the agent and every API it calls. When a request succeeds, the proxy passes the response through untouched. When a request fails, the proxy intercepts the error, analyzes it, and returns structured fix instructions.

```
                    Success (2xx)
Agent  -->  Proxy  ------------------>  API
              |                          |
              |    Error (4xx/5xx)       |
              |  <---------------------- |
              |
              |  Analyze + Enrich
              |
              |  Structured fix
Agent  <------
```

Why a proxy instead of wrapping every API call in try/catch?

**Consistency.** The proxy handles every API the same way. You do not need custom error-handling logic for Stripe, HubSpot, Salesforce, and every other service your agent calls. Add a new API and the error handling works automatically.

**Separation of concerns.** Your agent code stays clean. The agent calls APIs normally. Error enrichment happens at the infrastructure layer, not in your business logic.

**Security.** The proxy strips sensitive headers (Authorization, API keys) before sending error context to the analysis pipeline. Your credentials never leak into LLM prompts.

## Building This Yourself vs. Using a Service

You can build this proxy yourself. Here is what it takes:

- An HTTP proxy service that forwards requests and intercepts error responses
- An LLM pipeline that categorizes errors and generates fix instructions
- Header stripping to prevent credential leakage into the analysis LLM
- Rate limiting on the proxy itself (you do not want your error analysis to become a bottleneck)
- Logging and monitoring so you can see what your agents are failing on
- Caching for repeated identical errors (no need to re-analyze the same 422 ten times)

If you are calling two or three well-documented internal APIs, this is probably overkill. Write good error messages in your own APIs and call it a day.

If your agents call external APIs you do not control -- CRMs, payment processors, marketing platforms, third-party SaaS -- the proxy pattern saves significant debugging time. Every external API has its own error format, its own quirks, its own undocumented edge cases.

[Graceful Fail](https://selfheal.dev) is a hosted version of this pattern. It is three lines to integrate with a Python agent:

```bash
pip install 'graceful-fail[langchain]'
```

```python
from graceful_fail.langchain import GracefulFailTool

tool = GracefulFailTool(api_key="gf_your_key_here")
# Add to your agent's tool list -- that's it
```

Successful requests pass through free. You only pay when errors are intercepted and analyzed. There is a free tier at 500 requests per month.

## Real Example: Self-Healing LangChain Agent

Here is a complete agent that hits a validation error, reads the structured fix, corrects its payload, and succeeds on the second attempt:

```python
import os
from langchain_openai import ChatOpenAI
from langchain.agents import create_react_agent, AgentExecutor
from langchain_core.prompts import PromptTemplate
from graceful_fail.langchain import GracefulFailTool

tool = GracefulFailTool(api_key=os.environ["GRACEFUL_FAIL_API_KEY"])
llm = ChatOpenAI(model="gpt-4o", temperature=0)

prompt = PromptTemplate.from_template(
    """You are an API integration agent. When you receive an API error,
read the fix instructions carefully and correct your request before retrying.
If the error says Retriable: False, do NOT retry with the same payload.

You have access to these tools:
{tools}

Tool names: {tool_names}

Use this format:
Question: the task
Thought: what to do
Action: tool name
Action Input: JSON with "url", "method", "body", and optionally "headers"
Observation: result
... (repeat as needed)
Thought: I now know the final answer
Final Answer: the result

Question: {input}
{agent_scratchpad}"""
)

agent = create_react_agent(llm, [tool], prompt)
executor = AgentExecutor(
    agent=agent, tools=[tool], verbose=True, max_iterations=5
)

result = executor.invoke({
    "input": (
        "Create a new contact in the CRM at "
        "https://api.example-crm.com/v1/contacts "
        "with name 'Jane Smith' and company 'Acme Corp'"
    )
})
```

The agent loop looks like this:

**Attempt 1** -- agent forgets the required `email` field:

```
Action: graceful_fail_http
Action Input: {"url": "https://api.example-crm.com/v1/contacts",
  "method": "POST", "body": {"name": "Jane Smith", "company": "Acme Corp"}}

Observation:
API ERROR (HTTP 422, category: validation_error)
Retriable: False
Explanation: Missing required 'email' field.
Fix: Add 'email' with a valid email address string.
Add fields: {'email': 'string (valid email address)'}
```

**Attempt 2** -- agent reads the instructions and self-corrects:

```
Thought: I need to add an email field. I'll construct one from the name and company.
Action: graceful_fail_http
Action Input: {"url": "https://api.example-crm.com/v1/contacts",
  "method": "POST", "body": {"name": "Jane Smith", "company": "Acme Corp",
  "email": "jane.smith@acmecorp.com"}}

Observation: {"id": "contact_8x7k2m", "name": "Jane Smith", ...}
```

One informed retry instead of five blind ones. The agent resolved the issue itself.

## When NOT to Use This Pattern

Being honest about limitations:

**Latency on errors.** The proxy adds an LLM analysis step on every failed request. If your agent is latency-sensitive and errors are common during normal operation, this overhead matters. For overnight batch jobs or background agents, it is negligible.

**Cost.** Each intercepted error involves an LLM invocation on the proxy side. If your agent hits thousands of unique errors per day, the analysis costs add up. For most production agents, the number of distinct error patterns is small, and the cost is far less than the wasted API calls from blind retries.

**Simple internal APIs.** If you control the API and can write good error messages yourself, you do not need a proxy. Write your API responses in a format your agent can parse, document the error codes, and handle them directly. This pattern is most valuable when you are calling external APIs with error formats you cannot change.

**Deterministic failures.** If the same request will always fail (wrong endpoint, permanently revoked access), the proxy will tell the agent it is not retriable, but the agent still burned one attempt discovering that. For known-bad configurations, validate before calling.

## What This Changes for Production Agents

The difference between a demo agent and a production agent is what happens when things go wrong. Demo agents work when the APIs cooperate. Production agents need to handle the cases where they do not.

Structured error handling turns agents that crash on the first unexpected error into agents that diagnose, adapt, and recover. That is the difference between an agent you babysit and an agent you leave running overnight.

The specific tool does not matter as much as the pattern: give your agents machine-readable error signals instead of raw HTTP responses designed for human eyes.

If you want to try this with your own agents:

- **PyPI:** `pip install graceful-fail` ([pypi.org/project/graceful-fail](https://pypi.org/project/graceful-fail/))
- **npm:** `npm install graceful-fail` ([npmjs.com/package/graceful-fail](https://npmjs.com/package/graceful-fail))
- **Docs:** [selfheal.dev/docs](https://selfheal.dev/docs)
- **Free tier:** 500 intercepted requests/month at [selfheal.dev/signup](https://selfheal.dev/signup)
- **GitHub:** [github.com/carsonlabs/graceful-fail](https://github.com/carsonlabs/graceful-fail)
