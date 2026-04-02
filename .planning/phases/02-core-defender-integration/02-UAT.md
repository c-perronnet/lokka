---
status: complete
phase: 02-core-defender-integration
source: [02-01-SUMMARY.md]
started: 2026-04-02T10:00:00Z
updated: 2026-04-02T10:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Query Defender devices with apiType "defender"
expected: Using the Lokka-Microsoft MCP tool with `apiType: "defender"`, `path: "/api/machines"`, and `queryParams: {"$top": "3"}` returns a JSON response containing machine objects with fields like `computerDnsName`, `osPlatform`, `healthStatus`.
result: pass

### 2. Read-only guard rejects non-GET methods
expected: Using the Lokka-Microsoft tool with `apiType: "defender"` and `method: "POST"` returns an error message stating that only GET is supported for Defender API (no network call made).
result: pass

### 3. Get single machine by Defender device ID
expected: Using `apiType: "defender"` with `path: "/api/machines/{id}"` (replace `{id}` with a real machine ID from test 1) returns a single machine object with full details.
result: pass

### 4. Filter machines by osPlatform
expected: Using `apiType: "defender"`, `path: "/api/machines"`, and `queryParams: {"$filter": "osPlatform eq 'Windows10'"}` returns only machines running Windows 10.
result: pass

### 5. Pagination with fetchAll
expected: Using `apiType: "defender"`, `path: "/api/machines"`, and `fetchAll: true` returns a combined array of all machines across multiple pages (may take a moment for large tenants). The response should contain more results than a single `$top` page.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
