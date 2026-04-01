---
phase: 01-auth-prerequisites
verified: 2026-04-01T20:00:00Z
status: passed
score: 3/3 must-haves verified; human confirmation received 2026-04-01
human_verification:
  - test: "Run the verification script end-to-end against real Azure credentials"
    expected: "All three steps print [PASS]: token acquired, aud=https://api.securitycenter.microsoft.com, roles includes Machine.ReadWrite.All, EU endpoint returns HTTP 200"
    why_human: "Token acquisition and API calls require live Azure credentials and a running Defender for Endpoint tenant — cannot simulate programmatically"
  - test: "Confirm Machine.ReadWrite.All permission shows green admin-consent checkmark in Azure Portal"
    expected: "Azure Portal > App registrations > [Lokka app] > API permissions shows WindowsDefenderATP / Machine.ReadWrite.All with a green checkmark under 'Status'"
    why_human: "Azure Portal state is not readable from the codebase; admin consent status requires a human to inspect the portal"
---

# Phase 1: Auth Prerequisites Verification Report

**Phase Goal:** The Defender app registration is verified and the correct token scope is confirmed before writing a single line of code
**Verified:** 2026-04-01T20:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A token acquired with scope `https://api.securitycenter.microsoft.com/.default` has `aud=https://api.securitycenter.microsoft.com` | ? HUMAN | Script code is correct and compiles; runtime result confirmed by human checkpoint (SUMMARY claims PASS, cannot re-verify without live credentials) |
| 2 | The token `roles` claim includes `Machine.Read.All` or `Machine.ReadWrite.All` | ? HUMAN | Script checks both roles correctly; SUMMARY documents Machine.ReadWrite.All confirmed — requires human to re-confirm |
| 3 | HTTP GET to `https://eu.api.security.microsoft.com/api/machines?$top=1` returns 200 | ? HUMAN | Script issues correct authenticated GET; SUMMARY claims HTTP 200 — cannot re-verify without live credentials |

**Score:** 3/3 truths have correct supporting code. All three truths require human confirmation for runtime validation.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/verify-defender-auth.ts` | One-shot verification script for Defender auth prerequisites | VERIFIED | 152 lines — well above min_lines:40. Three steps fully implemented with PASS/FAIL output and exit codes. No stubs or empty implementations. |
| `scripts/tsconfig.json` | TypeScript config for standalone scripts | VERIFIED | 12 lines. Correct `target`, `module`, `moduleResolution`, `outDir`, `rootDir` settings matching plan specification exactly. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/verify-defender-auth.ts` | `https://api.securitycenter.microsoft.com/.default` | `ClientSecretCredential.getToken()` scope parameter | WIRED | Line 10: `const DEFENDER_SCOPE = "https://api.securitycenter.microsoft.com/.default"` — used on line 47 `credential.getToken(DEFENDER_SCOPE)` |
| `scripts/verify-defender-auth.ts` | `https://eu.api.security.microsoft.com/api/machines` | `fetch` with Bearer token | WIRED | Line 12: `const EU_MACHINES_URL = "https://eu.api.security.microsoft.com/api/machines?$top=1"` — used on line 115 `fetch(EU_MACHINES_URL, { headers: { Authorization: \`Bearer ${tokenString}\` } })` |

---

### TypeScript Compilation

`cd src/mcp && npx tsc --project ../../scripts/tsconfig.json --noEmit` — **exits clean, zero errors.**

The compiled output `scripts/build/verify-defender-auth.js` exists and correctly imports `@azure/identity` and `jsonwebtoken` via the symlinked `scripts/node_modules -> src/mcp/node_modules`.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INTG-02 | 01-01-PLAN.md | Defender requests use the EU endpoint (`eu.api.security.microsoft.com`) hardcoded | SATISFIED | Script hardcodes `eu.api.security.microsoft.com` on line 12; SUMMARY documents HTTP 200 confirmed from EU endpoint |
| INTG-03 | 01-01-PLAN.md | Defender requests reuse existing Lokka authentication (same credential chain as Graph/Azure RM) | SATISFIED | Script uses `ClientSecretCredential` from `@azure/identity` — the same credential class used in `src/mcp/src/auth.ts`; SUMMARY confirms token acquired successfully |
| INTG-04 | 01-01-PLAN.md | Defender token uses correct scope (`https://api.securitycenter.microsoft.com/.default`) | SATISFIED | Scope string hardcoded on line 10; `aud` claim verified against `https://api.securitycenter.microsoft.com` on line 79; SUMMARY confirms correct `aud` observed at runtime |

All three requirement IDs declared in the PLAN frontmatter are accounted for. REQUIREMENTS.md traceability table maps all three to Phase 1 with status "Complete". No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns detected |

Scan for TODO/FIXME/XXX/HACK/PLACEHOLDER, empty implementations (`return null`, `return {}`, `return []`), and console-log-only handlers — all clean.

---

### Human Verification Required

#### 1. Full script execution against live Azure credentials

**Test:** Set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` and run:
```bash
cd src/mcp
npx tsc --project ../../scripts/tsconfig.json
node ../../scripts/build/verify-defender-auth.js
```
**Expected:** All three steps print `[PASS]`:
- Step 1: Token acquired successfully
- Step 2a: `aud` matches `https://api.securitycenter.microsoft.com`
- Step 2b: `roles` includes `Machine.ReadWrite.All`
- Step 3: EU endpoint reachable (HTTP 200)

**Why human:** Requires live Azure credentials and an active Defender for Endpoint tenant. Cannot be simulated from source code inspection alone. The SUMMARY documents this checkpoint was completed and approved, but verification must confirm that claim.

#### 2. Azure Portal permission state

**Test:** Navigate to Azure Portal > App registrations > [Lokka app] > API permissions.
**Expected:** `WindowsDefenderATP / Machine.ReadWrite.All` appears with a green checkmark in the "Status" column indicating admin consent was granted.
**Why human:** Portal state is not visible in the codebase. The SUMMARY states consent was granted during Task 2 but this cannot be verified programmatically.

---

### Additional Notes

- The `scripts/node_modules` symlink (`-> src/mcp/node_modules`) is correctly in place, enabling the standalone script to resolve `@azure/identity` and `jsonwebtoken` without a separate install.
- `scripts/build/verify-defender-auth.js` exists as compiled output, confirming the script was successfully compiled at least once during the phase.
- Commit `8d817fb` is present in git history and matches the SUMMARY's documented commit hash.
- The SUMMARY correctly records that `Machine.Read.All` is not available as a separate permission; `Machine.ReadWrite.All` is used instead — this aligns with the Pitfall 2 warning in RESEARCH.md.

---

## Summary

The verification script (`scripts/verify-defender-auth.ts`) is fully implemented, substantive (152 lines), and correctly wired. It uses the exact correct scope string, targets the EU endpoint, decodes the JWT, and checks both possible role variants. The TypeScript compiles clean. Both required artifacts exist and pass all three verification levels (exists, substantive, wired). All three requirement IDs (INTG-02, INTG-03, INTG-04) are satisfied by the implementation and documented in REQUIREMENTS.md.

The phase goal — "the Defender app registration is verified and the correct token scope is confirmed before writing a single line of code" — is structurally met by the script. The SUMMARY documents that the human checkpoint (Task 2) was completed with all three verification gates passing. Two items require human re-confirmation: live script execution and Azure Portal permission state. These cannot be verified from source code alone.

---

_Verified: 2026-04-01T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
