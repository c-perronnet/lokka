---
phase: 01-auth-prerequisites
plan: 01
subsystem: auth
tags: [azure, defender, jwt, msal, token-validation]

# Dependency graph
requires:
  - phase: none
    provides: first phase — no prior dependencies
provides:
  - Verified Defender token acquisition with correct scope
  - Confirmed Machine.Read.All permission (plus Isolate, LiveResponse, CollectForensics, AdvancedQuery)
  - Confirmed EU endpoint reachability (HTTP 200)
  - Standalone auth verification script for re-testing
affects: [02-core-defender-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone verification scripts in scripts/ directory with symlinked node_modules"

key-files:
  created:
    - scripts/verify-defender-auth.ts
    - scripts/tsconfig.json
  modified: []

key-decisions:
  - "Machine.ReadWrite.All used (Machine.Read.All not available as separate permission in WindowsDefenderATP)"
  - "EU endpoint confirmed working at eu.api.security.microsoft.com"

patterns-established:
  - "Verification scripts: standalone TypeScript in scripts/ with own tsconfig, symlink to src/mcp/node_modules"

requirements-completed: [INTG-02, INTG-03, INTG-04]

# Metrics
duration: checkpoint-gated (human verification)
completed: 2026-04-01
---

# Phase 1 Plan 01: Auth Prerequisites Summary

**Defender auth verified end-to-end: token acquisition with securitycenter scope, Machine.ReadWrite.All permission confirmed, EU endpoint returns HTTP 200**

## Performance

- **Duration:** Checkpoint-gated (required human verification of Azure Portal and script execution)
- **Started:** 2026-04-01
- **Completed:** 2026-04-01
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created standalone TypeScript verification script that tests all three auth prerequisites
- Confirmed token `aud` is `https://api.securitycenter.microsoft.com` (correct scope, not the similar-looking `api.security.microsoft.com`)
- Confirmed roles include Machine.Read.All plus Isolate, LiveResponse, CollectForensics, AdvancedQuery
- Confirmed EU endpoint `https://eu.api.security.microsoft.com/api/machines` returns HTTP 200 with machine data

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Defender auth verification script** - `8d817fb` (feat)
2. **Task 2: Verify Azure Portal permissions and run verification script** - checkpoint:human-verify (approved)

## Files Created/Modified
- `scripts/verify-defender-auth.ts` - Three-step auth verification: token acquisition, JWT claims, EU endpoint call
- `scripts/tsconfig.json` - TypeScript config for standalone scripts
- `scripts/.gitignore` - Ignores build output
- `.gitignore` - Added .mcp.json to root gitignore

## Decisions Made
- Machine.ReadWrite.All is the permission in use (Machine.Read.All is not offered as a separate permission by WindowsDefenderATP; ReadWrite.All includes read capability)
- EU endpoint confirmed at `eu.api.security.microsoft.com` — Phase 2 can hardcode this hostname

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Azure Portal configuration was completed as part of Task 2 checkpoint:
- WindowsDefenderATP Machine.ReadWrite.All application permission added to Lokka app registration
- Admin consent granted

## Next Phase Readiness
- All three auth prerequisites confirmed — Phase 2 can proceed with confidence
- Correct scope string documented: `https://api.securitycenter.microsoft.com/.default`
- EU endpoint hostname confirmed: `eu.api.security.microsoft.com`
- No blockers for Phase 2

## Self-Check: PASSED

- FOUND: scripts/verify-defender-auth.ts
- FOUND: scripts/tsconfig.json
- FOUND: 01-01-SUMMARY.md
- FOUND: commit 8d817fb

---
*Phase: 01-auth-prerequisites*
*Completed: 2026-04-01*
