---
phase: 02-core-defender-integration
plan: 01
subsystem: api
tags: [defender, mcp, odata, pagination, microsoft-security]

# Dependency graph
requires:
  - phase: 01-auth-prerequisites
    provides: "App registration with WindowsDefenderATP permissions and admin consent"
provides:
  - "Defender for Endpoint device query support via apiType 'defender' in Lokka-Microsoft tool"
  - "DEFENDER_EU_BASE_URL and DEFENDER_SCOPE constants"
  - "Read-only guard, fetchAll pagination via @odata.nextLink, OData filter passthrough"
affects: [03-error-handling-ux]

# Tech tracking
tech-stack:
  added: []
  patterns: ["OData passthrough for filtering", "per-page token refresh in pagination loops", "read-only guard before network calls"]

key-files:
  created: []
  modified:
    - src/mcp/src/constants.ts
    - src/mcp/src/main.ts
    - src/mcp/build/constants.js
    - src/mcp/build/main.js

key-decisions:
  - "Used esbuild for JS emit due to tsc OOM on emit phase in constrained environment; tsc --noEmit confirms type correctness"
  - "OData filter passthrough via queryParams -- no custom filter builder needed"

patterns-established:
  - "API type branching: else if (apiType === 'defender') pattern extends existing if/else chain"
  - "Per-page token refresh: re-acquire token in pagination loop for long-running fetches"
  - "Read-only guard: check method before any network call to fail fast"

requirements-completed: [INTG-01, INTG-05, DEVL-01, DEVL-02, DEVL-03, DEVK-01, DEVK-02, FILT-01, FILT-02, FILT-03, FILT-04, FILT-05, FILT-06, FILT-07, FILT-08, FILT-09]

# Metrics
duration: 206min
completed: 2026-04-02
---

# Phase 2 Plan 01: Core Defender Integration Summary

**Defender for Endpoint device query support via apiType 'defender' with read-only guard, fetchAll pagination via @odata.nextLink, and OData filter passthrough for 9 filterable fields**

## Performance

- **Duration:** ~206 min (includes tsc OOM debugging)
- **Started:** 2026-04-01T21:24:43Z
- **Completed:** 2026-04-02T00:51:15Z
- **Tasks:** 3
- **Files modified:** 6 (2 source + 4 build)

## Accomplishments
- Extended Lokka-Microsoft MCP tool with `apiType: "defender"` for Defender for Endpoint device queries
- Implemented read-only guard blocking non-GET methods before any network call
- Added fetchAll pagination following `@odata.nextLink` with per-page token refresh
- OData filter passthrough supports all 9 filterable fields (healthStatus, riskScore, exposureLevel, osPlatform, onboardingStatus, lastSeen, machineTags, lastIpAddress, computerDnsName)
- Tool description documents Defender usage with filter syntax examples

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Defender constants and extend Zod schema** - `2c70e87` (feat)
2. **Task 2: Implement Defender handler branch with pagination** - `18a1d26` (feat)
3. **Task 3: Build and verify compilation** - `9936df1` (chore)

## Files Created/Modified
- `src/mcp/src/constants.ts` - Added DEFENDER_EU_BASE_URL and DEFENDER_SCOPE exports
- `src/mcp/src/main.ts` - Extended Zod enum, added Defender handler branch with read-only guard, token acquisition, pagination, single-page fetch, updated nextLinkKey logic and error handler
- `src/mcp/build/constants.js` - Rebuilt JS output with Defender constants
- `src/mcp/build/main.js` - Rebuilt JS output with Defender handler

## Decisions Made
- Used esbuild for JS emit because tsc runs out of memory during emit phase (OOM at 6GB) due to Graph SDK type complexity; tsc --noEmit confirms type correctness
- OData filter passthrough via queryParams -- no custom filter builder needed, all filtering works via $filter query parameter

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used esbuild instead of tsc for JS emit**
- **Found during:** Task 3 (Build and verify compilation)
- **Issue:** tsc OOMs during emit phase at 6GB heap; the Microsoft Graph SDK type resolution consumes all available memory during JS generation
- **Fix:** Used `npx esbuild` with `--format=esm --platform=node --target=es2022 --packages=external` to transpile source files to JS. Type correctness verified separately via `tsc --noEmit`.
- **Files modified:** src/mcp/build/*.js (4 files)
- **Verification:** Build output contains all defender elements (8 matches), correct constants, @odata.nextLink pagination, read-only guard. tsc --noEmit passes cleanly.
- **Committed in:** 9936df1 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Build tool substitution does not affect functionality. Type correctness confirmed via tsc --noEmit. JS output structurally equivalent.

## Issues Encountered
- tsc emit phase causes JavaScript heap OOM (killed at 6GB) due to Microsoft Graph SDK type resolution complexity. The `--noEmit` mode works fine for type checking. This is a known issue with large TypeScript type hierarchies in memory-constrained environments.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Defender handler fully implemented and type-checked
- Ready for Phase 3 (error handling, 429 retry, UX improvements)
- Note: future builds should use `tsc` on a machine with sufficient memory (8GB+), or continue using esbuild for transpilation with separate `tsc --noEmit` for type checking

---
*Phase: 02-core-defender-integration*
*Completed: 2026-04-02*
