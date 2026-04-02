# Retrospective

## Milestone: v1.0 — Defender for Endpoint Integration

**Shipped:** 2026-04-02
**Phases:** 3 | **Plans:** 3

### What Was Built
- Auth verification script confirming token scope, JWT claims, and EU endpoint reachability
- Full Defender handler in Lokka-Microsoft MCP tool (apiType branching, pagination, filters)
- Pagination hardening: 429 retry, EU hostname enforcement, actionable error messages

### What Worked
- **Research-first approach** caught the `@odata.nextLink` vs `nextLink` divergence before it became a runtime bug
- **Phase 1 auth verification** before any code prevented wasted effort on broken foundations
- **Single-plan phases** kept scope tight — no over-engineering
- **Human checkpoint for portal setup** ensured the Azure permission was actually granted, not just assumed

### What Was Inefficient
- **tsc OOM** cost ~2 hours debugging in Phase 2 before switching to esbuild; should have detected earlier
- **Phase 3 not marked complete in ROADMAP.md** by the executor — required manual cleanup

### Patterns Established
- `apiType` branching for new API backends (defender mirrors Azure RM pattern)
- Per-page token refresh in pagination loops for long-running fetches
- `formatDefenderError` for translating HTTP codes to user guidance
- esbuild for JS emit with separate tsc --noEmit for type safety

### Key Lessons
- Defender scope hostname (`securitycenter.microsoft.com`) differs from API hostname (`security.microsoft.com`) — this was the #1 pitfall caught by research
- `@odata.nextLink` may return global hostnames even for EU tenants — always rewrite
- MCP server credentials in `.mcp.json` must be gitignored

### Cost Observations
- Model mix: 100% Opus (executor, orchestrator), Sonnet (verifier, checker)
- Sessions: 2 (phases 1-2 in session 1, phase 3 + milestone in session 2)
- Notable: Single-plan phases executed efficiently; multi-plan parallelization not needed for this scope

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 3 |
| Plans | 3 |
| Requirements | 21 |
| Days | 2 |
| UAT pass rate | 100% (5/5) |
