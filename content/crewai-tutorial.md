---
title: "CrewAI Agent Error Recovery — A Production Pattern with Graceful Fail"
description: "CrewAI agents break when API calls fail mid-crew. Graceful Fail intercepts errors and returns structured fix instructions so your agents self-correct and the crew keeps running. Full integration tutorial."
tags: ["crewai", "python", "ai-agents", "error-handling", "crewai production", "crewai api errors"]
canonical_url: "https://selfheal.dev/blog/crewai-error-handling"
---

# CrewAI Agent Error Recovery — A Production Pattern with Graceful Fail

CrewAI is built for multi-agent workflows. You define a crew of specialized agents, each with its own role and tools, and they collaborate to complete complex tasks. It works well in demos. In production, it falls apart the moment an external API returns an error.

The problem is structural. A CrewAI crew is a pipeline. Agent A feeds into Agent B feeds into Agent C. If Agent B calls a CRM API and gets a 422, it doesn't know how to interpret the error. It retries with the same bad payload, burns through iterations, and either stalls the entire crew or passes garbage downstream. Agent C then writes a report based on nothing.

This tutorial shows you how to fix it with [Graceful Fail](https://selfheal.dev) -- an API proxy that intercepts failed calls and returns structured, LLM-readable fix instructions. Your CrewAI agents can read the instructions, correct their requests, and keep the crew moving.

---

## The Problem with CrewAI in Production

Here is a realistic scenario. You have a sales outreach crew with three agents:

1. **Research Agent** -- finds target companies from a list
2. **Enrichment Agent** -- calls a CRM API to pull contact details for each company
3. **Writer Agent** -- drafts personalized outreach emails using the enriched data

The Research Agent does its job fine. It outputs a list of companies. The Enrichment Agent picks up that list and starts calling the CRM API. On the third company, it sends a request with a malformed `industry` filter. The API returns:

```json
{
  "status": 422,
  "error": {
    "code": "validation_error",
    "message": "Invalid value for 'industry': 'saas' is not a recognized industry code. Use ISO industry codes (e.g., 'J62' for software development)."
  }
}
```

The agent sees raw JSON. It doesn't know what ISO industry codes are. It retries with the same payload. It retries again. After `max_iter` attempts, the Enrichment Agent gives up. The Writer Agent receives incomplete data and writes three emails instead of ten. Your pipeline produced 30% of its expected output and you have no idea why until you dig through logs.

This is not a hypothetical. Every CrewAI deployment that calls external APIs will hit this.

Here is that broken crew in code:

```python
import os
import requests
from crewai import Agent, Task, Crew, Process
from crewai.tools import tool

CRM_API_KEY = os.environ["CRM_API_KEY"]
CRM_BASE_URL = "https://api.example-crm.com/v1"


@tool
def search_contacts(company_name: str, industry: str) -> str:
    """Search the CRM for contacts at a given company, filtered by industry."""
    response = requests.get(
        f"{CRM_BASE_URL}/contacts/search",
        headers={"Authorization": f"Bearer {CRM_API_KEY}"},
        params={"company": company_name, "industry": industry},
    )
    return response.text


researcher = Agent(
    role="Company Research Analyst",
    goal="Identify target companies and their industries for outreach",
    backstory="You research B2B SaaS companies that could benefit from our product.",
    verbose=True,
)

enricher = Agent(
    role="Contact Enrichment Specialist",
    goal="Find decision-maker contact details for each target company",
    backstory="You use the CRM API to find VP and C-level contacts at target companies.",
    tools=[search_contacts],
    verbose=True,
)

writer = Agent(
    role="Outreach Email Writer",
    goal="Draft personalized outreach emails for each contact",
    backstory="You write concise, personalized cold emails that reference the prospect's company and role.",
    verbose=True,
)

research_task = Task(
    description="Find 5 B2B SaaS companies in the developer tools space that have raised Series A or B funding.",
    expected_output="A list of 5 companies with name and industry.",
    agent=researcher,
)

enrichment_task = Task(
    description="For each company from the research, search the CRM for VP-level or C-level contacts. Return name, title, email, and company for each.",
    expected_output="A list of contacts with name, title, email, and company.",
    agent=enricher,
)

writing_task = Task(
    description="For each contact, draft a personalized outreach email (3-4 sentences) mentioning their company and role.",
    expected_output="A set of personalized outreach emails, one per contact.",
    agent=writer,
)

crew = Crew(
    agents=[researcher, enricher, writer],
    tasks=[research_task, enrichment_task, writing_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff()
```

When `search_contacts` hits that 422, the enricher agent sees a wall of JSON and has no structured way to fix its request. The crew degrades silently.

---

## Setup

Install both packages:

```bash
pip install crewai graceful-fail
```

Get your Graceful Fail API key at [selfheal.dev/signup](https://selfheal.dev/signup). The free tier gives you 500 intercepted requests per month. Successful (2xx) requests pass through for free and don't count against your quota.

Set your environment variables:

```bash
export GRACEFUL_FAIL_API_KEY="gf_your_key_here"
export CRM_API_KEY="your_crm_api_key"
```

---

## Method 1: Custom Tool with Graceful Fail

The most direct approach. Build a CrewAI `@tool` that routes API calls through the Graceful Fail client. When the API returns an error, the tool returns structured fix instructions as a string. The CrewAI agent reads the instructions, corrects the payload, and retries.

```python
import os
from graceful_fail import GracefulFail
from crewai.tools import tool

gf = GracefulFail(api_key=os.environ["GRACEFUL_FAIL_API_KEY"])

CRM_API_KEY = os.environ["CRM_API_KEY"]
CRM_BASE_URL = "https://api.example-crm.com/v1"


@tool
def search_contacts(company_name: str, industry: str) -> str:
    """Search the CRM for contacts at a given company, filtered by industry.
    If the request fails, returns structured error analysis with fix instructions."""
    response = gf.get(
        f"{CRM_BASE_URL}/contacts/search",
        headers={"Authorization": f"Bearer {CRM_API_KEY}"},
        params={"company": company_name, "industry": industry},
    )

    if response.intercepted:
        analysis = response.error_analysis
        return (
            f"API ERROR (HTTP {response.status_code}, category: {analysis.error_category})\n"
            f"Retriable: {analysis.is_retriable}\n"
            f"Fix: {analysis.actionable_fix_for_agent}\n"
            f"Suggested changes: {analysis.suggested_payload_diff}"
        )

    return response.data
```

When the agent calls `search_contacts("Acme Corp", "saas")` and the CRM rejects the industry code, the tool returns:

```
API ERROR (HTTP 422, category: validation_error)
Retriable: False
Fix: Replace the 'industry' parameter value 'saas' with the ISO industry code 'J62' for software development. The API requires ISO 17369 industry classification codes, not free-text labels.
Suggested changes: {'modify': {'industry': 'J62'}}
```

The agent reads this, understands it needs to use `J62` instead of `saas`, and retries with the corrected parameter. One iteration instead of five failures.

---

## Method 2: GracefulFailSession as a Drop-in

If your CrewAI tools already use `requests` for HTTP calls, you can swap in `GracefulFailSession` with a one-line change. It is a `requests.Session` subclass that routes all requests through the Graceful Fail proxy.

### Before

```python
import requests

session = requests.Session()
session.headers.update({"Authorization": f"Bearer {CRM_API_KEY}"})
```

### After

```python
from graceful_fail.patch import GracefulFailSession

session = GracefulFailSession(api_key=os.environ["GRACEFUL_FAIL_API_KEY"])
session.headers.update({"Authorization": f"Bearer {CRM_API_KEY}"})
```

Everything else stays the same. The session intercepts 4xx/5xx responses and replaces them with structured error analysis. Your existing tools, error handling, and retry logic all continue to work -- they just get better error messages.

Here is the tool rewritten with the session approach:

```python
import os
from graceful_fail.patch import GracefulFailSession
from crewai.tools import tool

session = GracefulFailSession(api_key=os.environ["GRACEFUL_FAIL_API_KEY"])
session.headers.update({"Authorization": f"Bearer {os.environ['CRM_API_KEY']}"})

CRM_BASE_URL = "https://api.example-crm.com/v1"


@tool
def search_contacts(company_name: str, industry: str) -> str:
    """Search the CRM for contacts at a given company, filtered by industry."""
    response = session.get(
        f"{CRM_BASE_URL}/contacts/search",
        params={"company": company_name, "industry": industry},
    )

    if hasattr(response, "intercepted") and response.intercepted:
        analysis = response.error_analysis
        return (
            f"API ERROR (HTTP {response.status_code}, category: {analysis.error_category})\n"
            f"Retriable: {analysis.is_retriable}\n"
            f"Fix: {analysis.actionable_fix_for_agent}"
        )

    return response.text
```

This is the fastest path if you have existing tools and don't want to rewrite them.

---

## Auto-Retry Pattern

The previous methods return error instructions to the agent and let it decide what to do. Sometimes you want the tool itself to attempt a fix before the agent even sees the error. The `PayloadDiff.apply()` method makes this possible -- it takes the original payload and applies the suggested corrections automatically.

```python
import os
from graceful_fail import GracefulFail
from crewai.tools import tool

gf = GracefulFail(api_key=os.environ["GRACEFUL_FAIL_API_KEY"])

CRM_API_KEY = os.environ["CRM_API_KEY"]
CRM_BASE_URL = "https://api.example-crm.com/v1"


@tool
def create_contact(name: str, company: str, email: str = "", title: str = "") -> str:
    """Create a contact in the CRM. Automatically retries once with corrected
    payload if the API returns a validation error."""
    payload = {
        "name": name,
        "company": company,
        "email": email,
        "title": title,
    }
    # Remove empty fields to keep the request clean
    payload = {k: v for k, v in payload.items() if v}

    response = gf.post(
        f"{CRM_BASE_URL}/contacts",
        headers={"Authorization": f"Bearer {CRM_API_KEY}"},
        json=payload,
    )

    if not response.intercepted:
        return response.data

    analysis = response.error_analysis

    # If it's not retriable (auth error, etc.), return immediately
    if not analysis.is_retriable and analysis.error_category != "validation_error":
        return (
            f"API ERROR (HTTP {response.status_code})\n"
            f"Not retriable. {analysis.actionable_fix_for_agent}"
        )

    # Apply the suggested payload diff and retry once
    if analysis.suggested_payload_diff:
        corrected_payload = analysis.suggested_payload_diff.apply(payload)

        retry_response = gf.post(
            f"{CRM_BASE_URL}/contacts",
            headers={"Authorization": f"Bearer {CRM_API_KEY}"},
            json=corrected_payload,
        )

        if not retry_response.intercepted:
            return retry_response.data

        # Retry also failed -- return error to the agent
        retry_analysis = retry_response.error_analysis
        return (
            f"API ERROR (HTTP {retry_response.status_code}) after auto-retry.\n"
            f"Original error: {analysis.actionable_fix_for_agent}\n"
            f"Retry error: {retry_analysis.actionable_fix_for_agent}"
        )

    # No payload diff available -- return error to agent for manual fix
    return (
        f"API ERROR (HTTP {response.status_code})\n"
        f"Fix: {analysis.actionable_fix_for_agent}"
    )
```

With this pattern, the tool handles validation errors silently. The agent never sees them unless the auto-retry also fails. This reduces the number of agent iterations and keeps the crew moving faster.

The `PayloadDiff.apply()` method handles three types of corrections:
- **Add fields** -- inserts missing required fields with suggested values
- **Remove fields** -- strips fields the API doesn't accept
- **Modify fields** -- replaces values with corrected ones (e.g., `"saas"` to `"J62"`)

---

## Multi-Agent Crew Example

Here is a complete working crew that uses Graceful Fail for self-healing API calls. Three agents, three tasks, one pipeline that doesn't break when the CRM API pushes back.

```python
import os
from graceful_fail import GracefulFail
from crewai import Agent, Task, Crew, Process
from crewai.tools import tool

gf = GracefulFail(api_key=os.environ["GRACEFUL_FAIL_API_KEY"])

CRM_API_KEY = os.environ["CRM_API_KEY"]
CRM_BASE_URL = "https://api.example-crm.com/v1"


# --- Tools ---

@tool
def search_contacts(company_name: str, industry_code: str) -> str:
    """Search the CRM for decision-maker contacts at a company.
    Uses ISO 17369 industry codes (e.g., 'J62' for software).
    Auto-retries once with corrected parameters if the API rejects the request."""
    params = {"company": company_name, "industry": industry_code, "seniority": "VP+"}

    response = gf.get(
        f"{CRM_BASE_URL}/contacts/search",
        headers={"Authorization": f"Bearer {CRM_API_KEY}"},
        params=params,
    )

    if not response.intercepted:
        return response.data

    analysis = response.error_analysis

    # Auto-retry with corrected params if a diff is available
    if analysis.suggested_payload_diff:
        corrected_params = analysis.suggested_payload_diff.apply(params)
        retry = gf.get(
            f"{CRM_BASE_URL}/contacts/search",
            headers={"Authorization": f"Bearer {CRM_API_KEY}"},
            params=corrected_params,
        )
        if not retry.intercepted:
            return retry.data

        return (
            f"API ERROR after retry (HTTP {retry.status_code}): "
            f"{retry.error_analysis.actionable_fix_for_agent}"
        )

    return (
        f"API ERROR (HTTP {response.status_code}, {analysis.error_category})\n"
        f"Retriable: {analysis.is_retriable}\n"
        f"Fix: {analysis.actionable_fix_for_agent}"
    )


@tool
def get_contact_details(contact_id: str) -> str:
    """Fetch full contact details from the CRM by contact ID."""
    response = gf.get(
        f"{CRM_BASE_URL}/contacts/{contact_id}",
        headers={"Authorization": f"Bearer {CRM_API_KEY}"},
    )

    if response.intercepted:
        analysis = response.error_analysis
        return (
            f"API ERROR (HTTP {response.status_code}): "
            f"{analysis.actionable_fix_for_agent}"
        )

    return response.data


# --- Agents ---

researcher = Agent(
    role="Company Research Analyst",
    goal="Identify 5 target B2B SaaS companies for outreach and determine their ISO industry codes",
    backstory=(
        "You are a market research analyst who identifies high-potential "
        "companies in the developer tools space. You know that CRM systems "
        "use ISO 17369 industry codes: J62 for software development, "
        "J63 for information services, M72 for R&D."
    ),
    verbose=True,
)

enricher = Agent(
    role="Contact Enrichment Specialist",
    goal="Find VP and C-level contact details for each target company using the CRM",
    backstory=(
        "You use the CRM API to find decision-maker contacts at target companies. "
        "When an API call fails, you read the error analysis carefully, correct "
        "your parameters, and retry. You never repeat the same failed request."
    ),
    tools=[search_contacts, get_contact_details],
    verbose=True,
)

writer = Agent(
    role="Outreach Email Writer",
    goal="Draft personalized cold outreach emails for each contact",
    backstory=(
        "You write short, personalized cold emails (3-4 sentences) that reference "
        "the prospect's company name, their role, and a specific reason our product "
        "would help them. No generic templates."
    ),
    verbose=True,
)


# --- Tasks ---

research_task = Task(
    description=(
        "Find 5 B2B SaaS companies in the developer tools space that have "
        "raised Series A or B funding in the last 12 months. For each company, "
        "provide the name and the ISO 17369 industry code."
    ),
    expected_output=(
        "A list of 5 companies, each with: company name, industry code, "
        "and a one-sentence description of what they do."
    ),
    agent=researcher,
)

enrichment_task = Task(
    description=(
        "For each company from the research results, use the CRM tools to find "
        "VP-level or C-level contacts. Get their name, title, email, and company. "
        "If a search fails, read the error instructions and retry with corrected "
        "parameters. Do not skip companies."
    ),
    expected_output=(
        "A list of contacts with: name, title, email, company name. "
        "At least one contact per company."
    ),
    agent=enricher,
    context=[research_task],
)

writing_task = Task(
    description=(
        "For each contact from the enrichment results, write a personalized "
        "outreach email. Reference their company name, their title, and why "
        "our developer tools product would be relevant to them. Keep each email "
        "to 3-4 sentences."
    ),
    expected_output="A numbered list of outreach emails, one per contact.",
    agent=writer,
    context=[enrichment_task],
)


# --- Run the Crew ---

crew = Crew(
    agents=[researcher, enricher, writer],
    tasks=[research_task, enrichment_task, writing_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff()
print(result)
```

### What Happens When the API Pushes Back

Here is a trace of the enrichment agent working through an error. The researcher provided a company with industry label "devtools" instead of a proper ISO code:

```
[Enrichment Agent] Searching CRM for contacts at CloudBuild Inc (industry: devtools)...

Tool: search_contacts
Input: {"company_name": "CloudBuild Inc", "industry_code": "devtools"}

# First attempt hits a 422 -- Graceful Fail intercepts it
# Auto-retry kicks in with corrected params: industry_code changed to "J62"

Tool Output: [
  {"id": "ct_9xk2m", "name": "Sarah Chen", "title": "VP Engineering", "email": "sarah@cloudbuild.io"},
  {"id": "ct_3jp8n", "name": "Marcus Rivera", "title": "CTO", "email": "marcus@cloudbuild.io"}
]

[Enrichment Agent] Found 2 contacts at CloudBuild Inc. Moving to next company...
```

The crew completed without the enrichment agent needing an extra iteration. The auto-retry in the tool fixed the industry code before the error ever reached the agent. For more complex errors where auto-retry fails, the agent sees the structured fix instructions and can reason about what to change.

---

## Production Tips

### Error Categorization for Routing

Not all API errors should be handled the same way. Graceful Fail categorizes every error, and you can use that category to route different errors to different handling strategies:

```python
@tool
def resilient_api_call(endpoint: str, payload: dict) -> str:
    """Make an API call with error-category-aware handling."""
    response = gf.post(
        f"{CRM_BASE_URL}/{endpoint}",
        headers={"Authorization": f"Bearer {CRM_API_KEY}"},
        json=payload,
    )

    if not response.intercepted:
        return response.data

    analysis = response.error_analysis
    category = analysis.error_category

    if category == "auth_error":
        # Auth errors need human attention -- don't retry
        return (
            "ESCALATE TO HUMAN: Authentication failed. "
            "The API key may be expired or revoked. "
            "Do not retry this request."
        )

    elif category == "rate_limit":
        # Rate limits are transient -- tell the agent to wait
        return (
            "RATE LIMITED: The API is throttling requests. "
            "Wait 30 seconds before retrying this exact request."
        )

    elif category == "validation_error":
        # Validation errors can be auto-fixed
        if analysis.suggested_payload_diff:
            corrected = analysis.suggested_payload_diff.apply(payload)
            retry = gf.post(
                f"{CRM_BASE_URL}/{endpoint}",
                headers={"Authorization": f"Bearer {CRM_API_KEY}"},
                json=corrected,
            )
            if not retry.intercepted:
                return retry.data

        return f"VALIDATION ERROR: {analysis.actionable_fix_for_agent}"

    elif category == "not_found":
        # Resource doesn't exist -- tell the agent to skip
        return f"NOT FOUND: {analysis.actionable_fix_for_agent}"

    else:
        # Server errors, unknown errors -- return the analysis
        return (
            f"API ERROR ({category}, HTTP {response.status_code}): "
            f"{analysis.actionable_fix_for_agent}"
        )
```

This gives the CrewAI agent clear routing signals. Auth errors say "stop and escalate." Rate limits say "wait." Validation errors get auto-fixed. The agent doesn't waste iterations guessing at the right strategy.

### Webhook Notifications for Non-Retriable Errors

In production, you want to know when your crew hits errors that can't be auto-fixed. Set up a webhook at [selfheal.dev/docs/webhooks](https://selfheal.dev/docs/webhooks) to get notified on:

- **Auth errors** -- your API key rotated and the crew is stuck
- **Server errors (5xx)** -- the upstream API is down
- **Repeated validation errors** -- your payload schema might be out of date

The webhook sends a POST to your endpoint with the full error analysis, so you can triage without digging through logs.

### Monitoring via the Dashboard

The Graceful Fail dashboard at [selfheal.dev/dashboard](https://selfheal.dev/dashboard) shows:

- **Error frequency by category** -- spot patterns (e.g., sudden spike in auth errors means a key expired)
- **Top failing endpoints** -- identify which APIs cause the most crew failures
- **Auto-retry success rate** -- see how often `PayloadDiff.apply()` resolves errors without agent intervention
- **Credit usage** -- track how many intercepted errors you're consuming per month

For CrewAI deployments, the dashboard is the fastest way to understand why a crew run produced fewer results than expected.

---

## Ship Crews That Don't Break

CrewAI makes multi-agent orchestration straightforward. Graceful Fail makes it reliable. When your enrichment agent hits a 422, it doesn't stall the crew -- it reads structured fix instructions, corrects its request, and keeps the pipeline moving.

The pattern works for any crew that calls external APIs: CRM enrichment, payment processing, data ingestion, third-party integrations. Anywhere an API error can cascade into a full crew failure.

- **PyPI:** [pypi.org/project/graceful-fail](https://pypi.org/project/graceful-fail/)
- **Docs:** [selfheal.dev/docs](https://selfheal.dev/docs)
- **Free signup (500 requests/month):** [selfheal.dev/signup](https://selfheal.dev/signup)
- **GitHub:** [github.com/carsonlabs/graceful-fail](https://github.com/carsonlabs/graceful-fail)

```bash
pip install crewai graceful-fail
```

Questions or feedback? Open an issue on GitHub or reach out at [selfheal.dev/contact](https://selfheal.dev/contact).
