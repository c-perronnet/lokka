# Roadmap: Lokka — Defender for Endpoint Integration

## Overview

This milestone adds Microsoft Defender for Endpoint device querying to the existing Lokka MCP server. Phase 1 resolves auth prerequisites that are pre-implementation blockers. Phase 2 implements the full feature surface in one atomic commit (the Zod enum and handler branch have no valid intermediate state). Phase 3 hardens pagination for large tenants and locks in EU data residency.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Auth Prerequisites** - Verify token scope and app registration before any code is written
- [x] **Phase 2: Core Defender Integration** - Extend Lokka-Microsoft tool with full Defender device query support
- [ ] **Phase 3: Pagination Hardening** - Harden EU hostname normalization, 429 retry, and surface clear error messages

## Phase Details

### Phase 1: Auth Prerequisites
**Goal**: The Defender app registration is verified and the correct token scope is confirmed before writing a single line of code
**Depends on**: Nothing (first phase)
**Requirements**: INTG-02, INTG-03, INTG-04
**Success Criteria** (what must be TRUE):
  1. A token acquired with scope `https://api.securitycenter.microsoft.com/.default` returns HTTP 200 from `https://eu.api.security.microsoft.com/api/machines`
  2. Decoding the JWT confirms `aud` is `https://api.securitycenter.microsoft.com` (not `https://api.security.microsoft.com`)
  3. The Lokka app registration shows `Machine.Read.All` (or `Machine.ReadWrite.All`) under WindowsDefenderATP with admin consent granted
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Verify Defender auth prerequisites (token scope, JWT claims, EU endpoint)

### Phase 2: Core Defender Integration
**Goal**: Users can query Defender device data through the existing `Lokka-Microsoft` MCP tool using `apiType: "defender"`
**Depends on**: Phase 1
**Requirements**: INTG-01, INTG-05, DEVL-01, DEVL-02, DEVL-03, DEVK-01, DEVK-02, FILT-01, FILT-02, FILT-03, FILT-04, FILT-05, FILT-06, FILT-07, FILT-08, FILT-09
**Success Criteria** (what must be TRUE):
  1. Passing `apiType: "defender"` to `Lokka-Microsoft` returns machine data from `eu.api.security.microsoft.com` (not Graph or Azure RM)
  2. User can list all machines with `$top`/`$skip` pagination and `fetchAll: true` across multiple pages following `@odata.nextLink`
  3. User can retrieve a single machine by its Defender device ID via `/api/machines/{id}`
  4. User can search machines by DNS name prefix and filter by any combination of healthStatus, riskScore, exposureLevel, osPlatform, onboardingStatus, lastSeen, machineTags, and lastIpAddress
  5. Attempting a non-GET method returns a clear error instead of silently proceeding
**Plans:** 1 plan

Plans:
- [x] 02-01-PLAN.md — Extend Lokka-Microsoft with Defender handler (constants, schema, handler branch, pagination)

### Phase 3: Pagination Hardening
**Goal**: Large-tenant pagination is reliable under rate limits and EU data residency is enforced even when `@odata.nextLink` returns a global hostname
**Depends on**: Phase 2
**Requirements**: ERRH-01, ERRH-02
**Success Criteria** (what must be TRUE):
  1. A simulated 429 response during `fetchAll` pagination triggers retry with exponential backoff and eventually succeeds without user intervention
  2. `@odata.nextLink` URLs containing `api.security.microsoft.com` are rewritten to `eu.api.security.microsoft.com` before being followed
  3. Auth failures (wrong scope, missing permissions) surface a message that identifies the likely cause rather than a raw HTTP error code
**Plans:** 1 plan

Plans:
- [ ] 03-01-PLAN.md — Add 429 retry/backoff, EU hostname rewriting, and auth error formatting

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Auth Prerequisites | 1/1 | Complete | 2026-04-01 |
| 2. Core Defender Integration | 1/1 | Complete | 2026-04-02 |
| 3. Pagination Hardening | 0/1 | Not started | - |
