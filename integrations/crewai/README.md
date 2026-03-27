# SelfHeal Tool for CrewAI

A CrewAI-compatible tool that routes HTTP requests through the [GracefulFail](https://selfheal.dev) self-healing proxy. When an API returns an error, your agent receives structured fix instructions instead of a raw HTTP failure.

## Installation

```bash
pip install graceful-fail crewai
```

## Configuration

Set your API key as an environment variable:

```bash
export SELFHEAL_API_KEY=gf_your_key_here
```

Get your key at [selfheal.dev/dashboard](https://selfheal.dev/dashboard).

## Basic Usage

```python
from crewai import Agent, Task, Crew
from integrations.crewai.selfheal_tool import SelfHealTool

# Create the tool
selfheal = SelfHealTool()

# Assign it to an agent
api_agent = Agent(
    role="API Integration Specialist",
    goal="Fetch and submit data to external APIs reliably",
    backstory="You are an expert at working with REST APIs.",
    tools=[selfheal],
)

# Create a task
task = Task(
    description="Fetch the list of users from https://api.example.com/users",
    expected_output="A JSON list of users",
    agent=api_agent,
)

# Run the crew
crew = Crew(agents=[api_agent], tasks=[task])
result = crew.kickoff()
```

## How Self-Healing Works

When the destination API returns an error (4xx or 5xx), GracefulFail intercepts the response and returns structured analysis instead of the raw error:

### Success Response (pass-through)

The tool returns the API response as a JSON string, exactly as the destination API sent it.

### Error Response (intercepted)

The tool returns a readable text block:

```
API ERROR INTERCEPTED (HTTP 422)
Category: validation_error
Retriable: No

Explanation: The 'email' field is required by this endpoint but was not
included in the request body.

Fix: Add the 'email' field to the request body with a valid email address.

Suggested payload changes:
  Add field: email (string)
```

This lets the agent understand what went wrong and self-correct on the next attempt, without custom error-handling logic.

## Tool Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | str | required | Full URL of the API endpoint |
| `method` | str | `"GET"` | HTTP method: GET, POST, PUT, PATCH, DELETE |
| `body` | str | `None` | JSON-encoded request body |
| `headers` | str | `None` | JSON-encoded dictionary of HTTP headers |

Note: `body` and `headers` are JSON strings (not dicts) because CrewAI tool inputs are serialized as strings. The tool parses them internally.

## Example: POST with Error Recovery

```python
from crewai import Agent, Task, Crew
from integrations.crewai.selfheal_tool import SelfHealTool

selfheal = SelfHealTool()

agent = Agent(
    role="User Registration Bot",
    goal="Register new users via the API, fixing any validation errors",
    backstory=(
        "You register users by calling the API. If a request fails, "
        "read the fix instructions and retry with the corrected payload."
    ),
    tools=[selfheal],
)

task = Task(
    description=(
        "Register a new user with name 'Alice' at "
        "https://api.example.com/users using a POST request. "
        "If the first attempt fails, use the fix instructions to correct "
        "the payload and try again."
    ),
    expected_output="Confirmation that the user was created successfully",
    agent=agent,
)

crew = Crew(agents=[agent], tasks=[task])
result = crew.kickoff()
print(result)
```

In this example, if the API rejects the first request (e.g., missing `email` field), the agent will see the structured fix instructions and automatically retry with the corrected payload.

## Running Tests

```bash
pip install pytest
pytest integrations/crewai/test_selfheal_tool.py -v
```

All tests mock the GracefulFail client and make no real network calls.

## License

MIT
