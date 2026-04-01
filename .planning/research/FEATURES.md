# Feature Landscape

**Domain:** Microsoft Defender for Endpoint — Machine/Device API Integration (MCP Tool)
**Researched:** 2026-04-01
**Confidence:** HIGH (all findings sourced from official Microsoft Learn documentation, updated 2026-03-22)

---

## Table Stakes

Features users expect from a Defender device querying tool. Missing any of these = the tool is not useful.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| List all machines (paginated) | Foundation of any device inventory workflow; inventory sync requires full list | Low | `GET /api/machines` with `$top` up to 10,000; existing Lokka pagination pattern (fetchAll) maps directly |
| Get single machine by Defender ID | Required for detailed lookup after finding a machine ID in another result | Low | `GET /api/machines/{id}` — straightforward REST lookup |
| Filter by healthStatus | Primary triage: find unhealthy/inactive sensors; expected by any security team | Low | OData `$filter=healthStatus eq 'Active'`; enum values: `Active`, `Inactive`, `ImpairedCommunication`, `NoSensorData`, `NoSensorDataImpairedCommunication`, `Unknown` |
| Filter by riskScore | Security posture visibility: find high-risk devices instantly | Low | OData `$filter=riskScore eq 'High'`; enum: `None`, `Informational`, `Low`, `Medium`, `High` |
| Filter by exposureLevel | Vulnerability management triage; surfaces devices with known exposure | Low | OData `$filter=exposureLevel eq 'Medium'`; enum: `None`, `Low`, `Medium`, `High` |
| Filter by computerDnsName (startsWith) | Primary human-readable search — operators know hostnames, not Defender IDs | Low | OData `$filter=startswith(computerDnsName,'mymachine')` — officially documented and supported |
| Filter by osPlatform | Inventory segmentation (Windows vs Linux vs macOS); essential for patch campaigns | Low | OData `$filter=osPlatform eq 'Windows10'` |
| Filter by onboardingStatus | Find unenrolled devices; essential for coverage gap analysis | Low | OData `$filter=onboardingStatus eq 'onboarded'`; values: `onboarded`, `CanBeOnboarded`, `Unsupported`, `InsufficientInfo` |
| Pagination control ($top + $skip) | Large tenants can have thousands of devices; paging control is required for sync workflows | Low | `$top` max 10,000; `$skip` supported; maps to existing Lokka `fetchAll` parameter |
| Return full machine entity | All downstream uses (NetBox sync, security dashboards) need the full property set | Low | All properties returned by default in GET responses |

---

## Differentiators

Features that go beyond basic inventory and add meaningful value. Not expected by default, but highly valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Filter by lastSeen (date range) | Identify stale/dormant devices for decommissioning; clean up inventory | Low | OData `$filter=lastSeen gt 2024-01-01Z`; `gt`/`ge`/`lt`/`le` operators all supported |
| Filter by machineTags | Tag-based segmentation; teams use tags for environment (prod/staging), ownership, criticality | Low | OData `$filter=machineTags/any(tag: tag eq 'production')` |
| Filter by rbacGroupId | Multi-tenant / large org scenarios: scope queries to specific device groups | Low | OData `$filter=rbacGroupId eq 140` |
| Filter by aadDeviceId | Correlate Defender devices with Azure AD / Entra objects for identity-device linkage | Low | OData `$filter=aadDeviceId eq '{guid}'` |
| Filter by lastIpAddress | Reverse lookup: find device by its last known IP (exact match filter) | Low | OData `$filter=lastIpAddress eq '10.1.2.3'` |
| Find machines by internal IP at timestamp | Precise point-in-time IP-to-device resolution for incident response | Medium | Dedicated endpoint: `GET /api/machines/findbyip(ip='{IP}',timestamp={ts})`; timestamp must be within past 30 days; different URL pattern from OData filters |
| Find machines by tag (dedicated endpoint) | Faster/simpler than OData filter for tag lookups; supports startsWith | Low | `GET /api/machines/findbytag?tag={tag}&useStartsWithFilter=true`; separate from OData `$filter` on machineTags |
| Combined multi-property filters | Power users chain filters: `healthStatus ne 'Active' and riskScore eq 'High'` | Low | OData `and`/`or` operators work; all filterable properties can be combined |
| Filter by deviceValue | Prioritize high-value assets for security investment | Low | OData `$filter=deviceValue eq 'High'`; enum: `Normal`, `Low`, `High` |
| Filter by id (Defender device ID) | Bulk lookup by known IDs; `eq` operator supported | Low | OData `$filter=id eq '{id}'`; less useful than GET by ID but enables list queries |
| Filter by version | OS version targeting for patch campaigns | Low | OData `$filter=version eq '21H2'` |

---

## Anti-Features

Features to deliberately NOT build in this milestone. These are either out of scope by design or would create risk.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Write operations (isolate, scan, restrict, tag, unisolate) | Read-only by design; security constraint in PROJECT.md; write ops require Machine.ReadWrite.All and introduce operational risk | Scope to GET only; return clear error if caller attempts mutation |
| Alerts querying (/api/alerts) | Out of scope per PROJECT.md; separate domain with its own entity model and filter set | Documented as "can be added later" — track as future milestone |
| Vulnerability data (/api/vulnerabilities, /api/machines/{id}/vulnerabilities) | Out of scope per PROJECT.md; different permission scopes and heavy response payloads | Defer to a dedicated vulnerability milestone |
| Advanced hunting queries (/api/advancedqueries/run) | Out of scope per PROJECT.md; requires WindowsDefenderATP.Read.All scope; Kusto query language adds complexity | Defer entirely; not relevant to device inventory use case |
| Machine action history (/api/machineactions) | Actions are audit trail, not inventory; no device inventory value | Not applicable for NetBox sync or posture visibility |
| $orderby parameter | NOT supported by the Defender machines API — only $filter, $top, $skip are documented | Sort results client-side after fetching; or use $filter to reduce result set size before retrieving |
| $select parameter | NOT documented as supported for /api/machines — no evidence in official docs | Always return full entity; filtering to specific fields is not available on this endpoint |
| $expand parameter | NOT documented for machines endpoint (only shown for alerts with evidence) | Not available; use separate API calls for related data |
| $count parameter | NOT documented as supported for the machines list endpoint | Not available server-side; count results client-side |
| Multi-region support (US, UK, AU) | EU-only per PROJECT.md; adding region switching would require env var changes and user confusion | Hardcode eu.api.security.microsoft.com; document clearly |
| New authentication modes | Must reuse existing Lokka auth per PROJECT.md | No new auth flows; same credential chain as Graph and Azure RM tools |

---

## Available OData Query Parameters — /api/machines Endpoint

Source: Microsoft Learn — List machines API (updated 2026-03-22), OData queries with Defender for Endpoint

| Parameter | Supported | Max Value | Notes |
|-----------|-----------|-----------|-------|
| `$filter` | YES | — | See filterable properties below |
| `$top` | YES | 10,000 | Controls page size |
| `$skip` | YES | — | For offset-based pagination |
| `$orderby` | NO | — | Not supported on this endpoint |
| `$select` | NO | — | Not documented; full entity always returned |
| `$expand` | NO | — | Not documented for machines |
| `$count` | NO | — | Not documented for machines list |
| `$search` | NO | — | Not documented for machines; Graph-specific |

### Filterable Properties (confirmed by official docs)

| Property | Type | OData Operators Observed | Example |
|----------|------|--------------------------|---------|
| `computerDnsName` | String | `eq`, `startswith()` | `startswith(computerDnsName,'host')` |
| `id` | String | `eq` | `id eq 'abc123...'` |
| `version` | String | `eq` | `version eq '21H2'` |
| `deviceValue` | Enum | `eq` | `deviceValue eq 'High'` |
| `aadDeviceId` | Guid | `eq` | `aadDeviceId eq '{guid}'` |
| `machineTags` | String collection | `any()` lambda | `machineTags/any(tag: tag eq 'prod')` |
| `lastSeen` | DateTimeOffset | `gt`, `ge`, `lt`, `le` | `lastSeen gt 2024-01-01Z` |
| `exposureLevel` | Enum | `eq` | `exposureLevel eq 'Medium'` |
| `onboardingStatus` | String | `eq` | `onboardingStatus eq 'onboarded'` |
| `lastIpAddress` | String | `eq` | `lastIpAddress eq '10.1.2.3'` |
| `healthStatus` | Enum | `eq`, `ne` | `healthStatus ne 'Active'` |
| `osPlatform` | String | `eq` | `osPlatform eq 'Windows10'` |
| `riskScore` | Enum | `eq` | `riskScore eq 'High'` |
| `rbacGroupId` | String | `eq` | `rbacGroupId eq '140'` |

Logical operators `and` / `or` can combine any of the above.

---

## Machine Entity Properties

Source: Microsoft Learn — Machine resource type (updated 2026-03-22)

| Property | Type | Nullable | Description |
|----------|------|----------|-------------|
| `id` | String | No | Defender device identity (SHA-1 hash) |
| `computerDnsName` | String | No | Fully qualified DNS name |
| `firstSeen` | DateTimeOffset | No | First observation by Defender |
| `lastSeen` | DateTimeOffset | No | Last full device report (every 24h); not same as UI "last seen" |
| `osPlatform` | String | No | OS platform (e.g., `Windows10`, `Windows11`, `Linux`) |
| `onboardingStatus` | String | No | Onboarding state: `onboarded`, `CanBeOnboarded`, `Unsupported`, `InsufficientInfo` |
| `osProcessor` | String | No | Deprecated; use `osArchitecture` instead |
| `osArchitecture` | String | No | `32-bit` or `64-bit` |
| `version` | String | No | OS version string |
| `osBuild` | Long | Yes | OS build number |
| `lastIpAddress` | String | No | Last IP on local NIC |
| `lastExternalIpAddress` | String | No | Last external (internet-facing) IP |
| `healthStatus` | Enum | No | `Active`, `Inactive`, `ImpairedCommunication`, `NoSensorData`, `NoSensorDataImpairedCommunication`, `Unknown` |
| `rbacGroupName` | String | No | Device group name (RBAC) |
| `rbacGroupId` | String | No | Device group ID (RBAC) |
| `riskScore` | Enum | Yes | `None`, `Informational`, `Low`, `Medium`, `High` |
| `aadDeviceId` | Guid | Yes | Azure AD / Entra device ID (only if AAD-joined) |
| `machineTags` | String[] | No | Collection of tag strings |
| `exposureLevel` | Enum | Yes | `None`, `Low`, `Medium`, `High` |
| `deviceValue` | Enum | Yes | `Normal`, `Low`, `High` |
| `ipAddresses` | IpAddress[] | No | Full IP/MAC collection; each has `ipAddress`, `macAddress`, `operationalStatus` |
| `isAadJoined` | Boolean | No | Whether device is Azure AD joined |

---

## Feature Dependencies

```
List machines (paginated) → All filter features (filters are query params on the same endpoint)
Get machine by ID → No dependencies (standalone GET)
Find by IP at timestamp → Separate dedicated endpoint; no dependency on list machines
Find by tag (dedicated endpoint) → Separate from OData filter; no dependency on list machines
Combined filters → Requires list machines endpoint
```

Key constraint: `$filter` on `machineTags` requires OData lambda syntax (`any()`), which is more complex to construct in the tool than simple `eq` comparisons. The dedicated `/api/machines/findbytag` endpoint is simpler for tag lookups.

---

## MVP Recommendation

For this milestone (device querying capabilities for NetBox sync + security posture visibility), prioritize:

1. **List machines with OData filter support** — Covers the bulk of all use cases via a single flexible tool parameter. Support `$filter`, `$top`, `$skip`, and `fetchAll`.
2. **Get machine by ID** — Targeted lookup after finding an ID.
3. **Filter by computerDnsName (startsWith)** — DNS name search is the primary human-readable lookup pattern.
4. **Health/risk/exposure filters** — Core security posture properties; enable the stated "health status, risk score, and exposure level visibility" requirement.

Defer:
- **Find by IP at timestamp** (`findbyip`) — Incident response use case, not inventory sync; can be added in a follow-on.
- **Find by tag (dedicated endpoint)** — OData `$filter=machineTags` covers the same need; dedicated endpoint is a convenience, not a blocker.

---

## Sources

- [List machines API](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machines) — HIGH confidence (official docs, updated 2026-03-22)
- [Machine resource type](https://learn.microsoft.com/en-us/defender-endpoint/api/machine) — HIGH confidence (official docs, updated 2026-03-22)
- [Get machine by ID](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machine-by-id) — HIGH confidence (official docs, updated 2026-03-22)
- [OData queries with Defender for Endpoint](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-odata-samples) — HIGH confidence (official docs, updated 2026-03-22)
- [Find devices by internal IP](https://learn.microsoft.com/en-us/defender-endpoint/api/find-machines-by-ip) — HIGH confidence (official docs, updated 2026-03-22)
- [Find devices by tag](https://learn.microsoft.com/en-us/defender-endpoint/api/find-machines-by-tag) — HIGH confidence (official docs, updated 2026-03-22)

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Table Stakes | HIGH | All verified against official Microsoft Learn docs updated 2026-03-22 |
| OData Parameters | HIGH | Exhaustive official list; confirmed supported vs unsupported |
| Machine Entity Properties | HIGH | Directly from the Machine resource type reference |
| Differentiators | HIGH | Confirmed filterable per official filter property list |
| Anti-Features | HIGH | Absence of $orderby, $select, $expand, $count confirmed by checking official docs |
