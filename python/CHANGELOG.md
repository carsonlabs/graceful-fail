# Changelog

## 0.2.0 (2026-03-27)

### Added
- BYOLLM support: `llm_api_key`, `llm_model`, and `llm_base_url` parameters on `GracefulFail` and `GracefulFailAsync` constructors
- Use your own OpenAI, Anthropic, or Azure key for error analysis instead of the SelfHeal default

### Example
```python
gf = GracefulFail(
    api_key="gf_your_key",
    llm_api_key="sk-your-openai-key",
    llm_model="gpt-4o",
)
```

## 0.1.0 (2026-03-27)

- Initial release
- Sync and async HTTP clients
- LangChain integration (GracefulFailTool, GracefulFailRequests)
- requests-compatible GracefulFailSession
- Error types: AuthenticationError, RateLimitError, ProxyError
- PayloadDiff.apply() for auto-correcting payloads
