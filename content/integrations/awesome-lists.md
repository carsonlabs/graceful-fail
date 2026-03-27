# Awesome List Submissions for SelfHeal (graceful-fail)

PR-ready markdown entries for awesome list submissions. Each entry follows the formatting conventions of its target repo.

---

## 1. awesome-ai-agents (e2b-dev/awesome-ai-agents)

**Repo:** https://github.com/e2b-dev/awesome-ai-agents
**Submission form:** https://forms.gle/UXQFCogLYrPFvfoUA
**Section:** Open source
**PR target:** `README.md`

### Entry to add (alphabetical — insert between entries starting with R and T):

```markdown
- [SelfHeal](https://selfheal.dev) - Self-healing API proxy for AI agents. Intercepts failed API calls and returns LLM-powered fix instructions. SDKs for Python and Node.js.
```

### Notes:
- Also submit via the Google Form at https://forms.gle/UXQFCogLYrPFvfoUA (some awesome lists require both a form and a PR)
- Check the existing format before submitting — if they use `**bold**` names or different separators, match that

---

## 2. awesome-langchain (kyrolabs/awesome-langchain)

**Repo:** https://github.com/kyrolabs/awesome-langchain
**Section:** Tools
**PR target:** `README.md`

### Entry to add:

```markdown
- [graceful-fail](https://selfheal.dev) ![PyPI](https://img.shields.io/pypi/v/graceful-fail) ![npm](https://img.shields.io/npm/v/graceful-fail) - Self-healing API proxy with native LangChain integration. Wraps API calls and returns structured fix instructions on failure. `pip install 'graceful-fail[langchain]'`
```

### Alternate (minimal, if badges aren't used in that section):

```markdown
- [graceful-fail](https://selfheal.dev): Self-healing API proxy with LangChain integration. Returns LLM-powered fix instructions when API calls fail. [PyPI](https://pypi.org/project/graceful-fail/) / [npm](https://www.npmjs.com/package/graceful-fail)
```

---

## 3. awesome-crewai

**Repo:** https://github.com/crewAIInc/awesome-crewai (if it exists; also check https://github.com/sw-yx/awesome-crewai)
**Section:** Tools / Integrations
**PR target:** `README.md`

### Entry to add:

```markdown
- [graceful-fail](https://selfheal.dev) - Self-healing API proxy for CrewAI agents. Wraps external API tools with structured error recovery and LLM-powered fix suggestions. [PyPI](https://pypi.org/project/graceful-fail/)
```

---

## 4. awesome-llm / awesome-llm-tools

**Repos to check:**
- https://github.com/Hannibal046/awesome-llm
- https://github.com/KennethanCewororth/awesome-llm-tools (if it exists)
- https://github.com/tensorchord/awesome-llm-apps

**Section:** Tools / Agent Infrastructure
**PR target:** `README.md`

### Entry to add:

```markdown
- [SelfHeal (graceful-fail)](https://selfheal.dev) - Self-healing API proxy that intercepts failed API calls and returns LLM-analyzed fix instructions. SDKs for Python and Node.js with LangChain and CrewAI integrations. [GitHub](https://github.com/carsonlabs/graceful-fail)
```

---

## 5. awesome-developer-tools

**Repos to check:**
- https://github.com/meirwah/awesome-developer-tools (if it exists)
- https://github.com/lk-geimfari/awesome-developer-tools (if it exists)

**Section:** API Tools / Debugging
**PR target:** `README.md`

### Entry to add:

```markdown
- [SelfHeal](https://selfheal.dev) - API proxy that intercepts failing requests and returns LLM-powered fix instructions. Useful for AI agents and automated pipelines. [npm](https://www.npmjs.com/package/graceful-fail) / [PyPI](https://pypi.org/project/graceful-fail/)
```

---

## Submission Checklist

- [ ] Verify each repo's CONTRIBUTING.md for submission guidelines before opening PRs
- [ ] Match the exact formatting (dashes, brackets, bold, badges) used by existing entries
- [ ] Ensure alphabetical placement within the target section
- [ ] Submit the Google Form for awesome-ai-agents: https://forms.gle/UXQFCogLYrPFvfoUA
- [ ] Include a one-line PR description explaining what SelfHeal does
- [ ] Link to the live product (selfheal.dev), not just the GitHub repo
- [ ] Wait for awesome-ai-agents form confirmation before opening the PR (some lists require form-first)

## PR Title Templates

| List | PR Title |
|------|----------|
| awesome-ai-agents | `Add SelfHeal — self-healing API proxy for AI agents` |
| awesome-langchain | `Add graceful-fail — self-healing API proxy with LangChain integration` |
| awesome-crewai | `Add graceful-fail — self-healing API proxy for CrewAI agents` |
| awesome-llm | `Add SelfHeal — LLM-powered API error recovery proxy` |
| awesome-developer-tools | `Add SelfHeal — API proxy with LLM-powered fix instructions` |
