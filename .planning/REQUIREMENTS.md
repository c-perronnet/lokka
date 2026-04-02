# Requirements: Lokka — Defender for Endpoint Integration

**Defined:** 2026-04-01
**Core Value:** Users can query Defender device data through the same MCP interface that handles Microsoft Graph and Azure RM

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Integration

- [x] **INTG-01**: User can query Defender for Endpoint API via the existing `Lokka-Microsoft` tool with `apiType: "defender"`
- [x] **INTG-02**: Defender requests use the EU endpoint (`eu.api.security.microsoft.com`) hardcoded
- [x] **INTG-03**: Defender requests reuse existing Lokka authentication (same credential chain as Graph/Azure RM)
- [x] **INTG-04**: Defender token uses correct scope (`https://api.securitycenter.microsoft.com/.default`)
- [x] **INTG-05**: Only GET (read-only) operations are supported; non-GET methods return a clear error

### Device Listing

- [x] **DEVL-01**: User can list all machines with pagination support (`$top`, `$skip`)
- [x] **DEVL-02**: User can fetch all machines across pages using `fetchAll: true`
- [x] **DEVL-03**: Pagination follows `@odata.nextLink` correctly (not bare `nextLink`)

### Device Lookup

- [x] **DEVK-01**: User can get a specific machine by its Defender ID via path `/api/machines/{id}`
- [x] **DEVK-02**: User can search machines by DNS name prefix using OData `startswith(computerDnsName,'prefix')`

### Filtering

- [x] **FILT-01**: User can filter machines by `healthStatus` (Active, Inactive, ImpairedCommunication, NoSensorData, etc.)
- [x] **FILT-02**: User can filter machines by `riskScore` (None, Informational, Low, Medium, High)
- [x] **FILT-03**: User can filter machines by `exposureLevel` (None, Low, Medium, High)
- [x] **FILT-04**: User can filter machines by `osPlatform` (Windows10, Linux, etc.)
- [x] **FILT-05**: User can filter machines by `onboardingStatus` (onboarded, CanBeOnboarded, etc.)
- [x] **FILT-06**: User can filter machines by `lastSeen` date range (gt, ge, lt, le operators)
- [x] **FILT-07**: User can filter machines by `machineTags` using OData lambda syntax
- [x] **FILT-08**: User can filter machines by `lastIpAddress` (exact match)
- [x] **FILT-09**: User can combine multiple filters using OData `and`/`or` operators

### Error Handling

- [x] **ERRH-01**: 429 rate limit responses are retried with backoff during pagination
- [x] **ERRH-02**: Clear error messages for auth failures (wrong scope, missing permissions)

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
| INTG-01 | Phase 2 | Complete |
| INTG-02 | Phase 1 | Complete |
| INTG-03 | Phase 1 | Complete |
| INTG-04 | Phase 1 | Complete |
| INTG-05 | Phase 2 | Complete |
| DEVL-01 | Phase 2 | Complete |
| DEVL-02 | Phase 2 | Complete |
| DEVL-03 | Phase 2 | Complete |
| DEVK-01 | Phase 2 | Complete |
| DEVK-02 | Phase 2 | Complete |
| FILT-01 | Phase 2 | Complete |
| FILT-02 | Phase 2 | Complete |
| FILT-03 | Phase 2 | Complete |
| FILT-04 | Phase 2 | Complete |
| FILT-05 | Phase 2 | Complete |
| FILT-06 | Phase 2 | Complete |
| FILT-07 | Phase 2 | Complete |
| FILT-08 | Phase 2 | Complete |
| FILT-09 | Phase 2 | Complete |
| ERRH-01 | Phase 3 | Complete |
| ERRH-02 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after roadmap creation*
