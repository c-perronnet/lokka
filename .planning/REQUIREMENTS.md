# Requirements: Lokka — Defender for Endpoint Integration

**Defined:** 2026-04-01
**Core Value:** Users can query Defender device data through the same MCP interface that handles Microsoft Graph and Azure RM

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Integration

- [ ] **INTG-01**: User can query Defender for Endpoint API via the existing `Lokka-Microsoft` tool with `apiType: "defender"`
- [x] **INTG-02**: Defender requests use the EU endpoint (`eu.api.security.microsoft.com`) hardcoded
- [x] **INTG-03**: Defender requests reuse existing Lokka authentication (same credential chain as Graph/Azure RM)
- [x] **INTG-04**: Defender token uses correct scope (`https://api.securitycenter.microsoft.com/.default`)
- [ ] **INTG-05**: Only GET (read-only) operations are supported; non-GET methods return a clear error

### Device Listing

- [ ] **DEVL-01**: User can list all machines with pagination support (`$top`, `$skip`)
- [ ] **DEVL-02**: User can fetch all machines across pages using `fetchAll: true`
- [ ] **DEVL-03**: Pagination follows `@odata.nextLink` correctly (not bare `nextLink`)

### Device Lookup

- [ ] **DEVK-01**: User can get a specific machine by its Defender ID via path `/api/machines/{id}`
- [ ] **DEVK-02**: User can search machines by DNS name prefix using OData `startswith(computerDnsName,'prefix')`

### Filtering

- [ ] **FILT-01**: User can filter machines by `healthStatus` (Active, Inactive, ImpairedCommunication, NoSensorData, etc.)
- [ ] **FILT-02**: User can filter machines by `riskScore` (None, Informational, Low, Medium, High)
- [ ] **FILT-03**: User can filter machines by `exposureLevel` (None, Low, Medium, High)
- [ ] **FILT-04**: User can filter machines by `osPlatform` (Windows10, Linux, etc.)
- [ ] **FILT-05**: User can filter machines by `onboardingStatus` (onboarded, CanBeOnboarded, etc.)
- [ ] **FILT-06**: User can filter machines by `lastSeen` date range (gt, ge, lt, le operators)
- [ ] **FILT-07**: User can filter machines by `machineTags` using OData lambda syntax
- [ ] **FILT-08**: User can filter machines by `lastIpAddress` (exact match)
- [ ] **FILT-09**: User can combine multiple filters using OData `and`/`or` operators

### Error Handling

- [ ] **ERRH-01**: 429 rate limit responses are retried with backoff during pagination
- [ ] **ERRH-02**: Clear error messages for auth failures (wrong scope, missing permissions)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Extended Endpoints

- **EXT-01**: Find machines by internal IP at timestamp (`/api/machines/findbyip`)
- **EXT-02**: Find machines by tag via dedicated endpoint (`/api/machines/findbytag`)
- **EXT-03**: Query alerts (`/api/alerts`)
- **EXT-04**: Query vulnerabilities (`/api/vulnerabilities`)

### Enhanced Auth

- **AUTH-01**: Extend `add-graph-permission` tool to handle Defender consent for interactive auth
- **AUTH-02**: Support client-provided token mode with Defender-audience tokens

### Multi-Region

- **REGN-01**: Configurable region endpoint (US, EU, UK, AU) via environment variable

## Out of Scope

| Feature | Reason |
|---------|--------|
| Write operations (isolate, scan, tag, restrict) | Read-only by design; security constraint |
| Advanced hunting queries | Different API, Kusto language complexity, not inventory use case |
| Machine action history | Audit trail, not inventory; no device inventory value |
| $orderby support | Not supported by Defender machines API |
| $select / $expand / $count | Not supported by Defender machines API |
| New authentication modes | Must reuse existing Lokka auth |
| Other regions (US, UK, AU) | EU only for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INTG-01 | Phase 2 | Pending |
| INTG-02 | Phase 1 | Complete |
| INTG-03 | Phase 1 | Complete |
| INTG-04 | Phase 1 | Complete |
| INTG-05 | Phase 2 | Pending |
| DEVL-01 | Phase 2 | Pending |
| DEVL-02 | Phase 2 | Pending |
| DEVL-03 | Phase 2 | Pending |
| DEVK-01 | Phase 2 | Pending |
| DEVK-02 | Phase 2 | Pending |
| FILT-01 | Phase 2 | Pending |
| FILT-02 | Phase 2 | Pending |
| FILT-03 | Phase 2 | Pending |
| FILT-04 | Phase 2 | Pending |
| FILT-05 | Phase 2 | Pending |
| FILT-06 | Phase 2 | Pending |
| FILT-07 | Phase 2 | Pending |
| FILT-08 | Phase 2 | Pending |
| FILT-09 | Phase 2 | Pending |
| ERRH-01 | Phase 3 | Pending |
| ERRH-02 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after roadmap creation*
