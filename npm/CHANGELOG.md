# Changelog

## 0.2.0 (2026-03-27)

### Added
- BYOLLM support: `llmApiKey`, `llmModel`, and `llmBaseUrl` options on the `GracefulFail` constructor
- Use your own OpenAI, Anthropic, or Azure key for error analysis

### Example
```typescript
const gf = new GracefulFail({
    apiKey: "gf_your_key",
    llmApiKey: "sk-your-openai-key",
    llmModel: "gpt-4o",
});
```

## 0.1.0 (2026-03-27)

- Initial release
- TypeScript client with full type definitions
- LangChain.js integration via graceful-fail/langchain
- applyDiff utility
- Error types: AuthenticationError, RateLimitError, ProxyError
- Dual CJS/ESM build
