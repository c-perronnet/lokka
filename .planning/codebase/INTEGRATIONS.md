# External Integrations

**Analysis Date:** 2026-04-01

## APIs & External Services

**Microsoft Graph API:**
- Microsoft Graph - Query and manage Microsoft 365 and Azure AD data (users, groups, mail, etc.)
  - SDK/Client: @microsoft/microsoft-graph-client 3.0.7
  - Endpoints: `https://graph.microsoft.com/v1.0` and `https://graph.microsoft.com/beta`
  - Implementation: `src/mcp/src/main.ts` (lines 79-152)
  - Features: Pagination support (PageIterator), query parameters ($filter, $count, $search, $orderby), consistency level headers
  - Auth: Via TokenCredentialAuthProvider

**Azure Resource Management API:**
- Azure Resource Manager - Manage Azure subscriptions, resource groups, and resources
  - Endpoints: `https://management.azure.com`
  - Implementation: `src/mcp/src/main.ts` (lines 153-256)
  - Features: Pagination with nextLink, subscription-based queries
  - Auth: Bearer token from Azure Identity credentials

## Data Storage

**Logging:**
- File-based logging only - logs written to `src/mcp/src/mcp-server.log`
- Implementation: `src/mcp/src/logger.ts`
- No database or persistent data storage

**No External Data Stores:**
- No database configured (not applicable for MCP server)
- No file storage service integration
- No caching layer configured

## Authentication & Identity

**Auth Provider:**
- Azure Identity (@azure/identity 4.3.0)

**Supported Authentication Modes:**
1. **Interactive Browser/Device Code** (AuthMode.Interactive)
   - `src/mcp/src/auth.ts` lines 162-190
   - Uses InteractiveBrowserCredential with fallback to DeviceCodeCredential
   - Default app: Lokka public app (Client ID: a9bac4c3-af0d-4292-9453-9da89e390140, Tenant: common)
   - Default redirect URI: http://localhost:3000
   - Environment variables: `USE_INTERACTIVE=true` (optional), `TENANT_ID`, `CLIENT_ID`, `REDIRECT_URI`

2. **Client Credentials** (AuthMode.ClientCredentials)
   - `src/mcp/src/auth.ts` lines 131-141
   - Uses ClientSecretCredential from Azure Identity
   - For app-only/service principal authentication
   - Environment variables: `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`

3. **Certificate-Based** (AuthMode.Certificate)
   - `src/mcp/src/auth.ts` lines 151-160
   - Uses ClientCertificateCredential from Azure Identity
   - Supports PEM-encoded certificates with optional password
   - Environment variables: `TENANT_ID`, `CLIENT_ID`, `CERTIFICATE_PATH`, `CERTIFICATE_PASSWORD`, `USE_CERTIFICATE=true`

4. **Client-Provided Token** (AuthMode.ClientProvidedToken)
   - `src/mcp/src/auth.ts` lines 143-149, 62-100
   - Custom ClientProvidedTokenCredential implementation for dynamic token management
   - Token can be updated at runtime via `set-access-token` MCP tool
   - Token expiration tracking (defaults to 1 hour if not specified)
   - Environment variables: `USE_CLIENT_TOKEN=true`, `ACCESS_TOKEN` (optional)

**Token Management Tools:**
- `set-access-token` - Update access token at runtime (requires `USE_CLIENT_TOKEN=true`)
- `get-auth-status` - Check current auth mode and token status
- `add-graph-permission` - Request additional Graph API scopes with fresh authentication

**Credential Resolution:**
- `src/mcp/src/main.ts` lines 574-677 - Main authentication initialization
- Default behavior: Interactive mode if no auth mode specified and no client credentials found
- Only one authentication mode can be enabled at a time

## Monitoring & Observability

**Error Tracking:**
- Logging to local file only
- Error logs include timestamp, level (INFO/ERROR), message, and JSON data if applicable
- Log location: `src/mcp/src/mcp-server.log`

**Logs:**
- File-based append-only logging using Node.js fs.appendFileSync
- Implementation: `src/mcp/src/logger.ts`
- Log format: `[ISO timestamp] [LEVEL] message[optional JSON data]`
- Debugging: Error responses include statusCode, errorBody, and attemptedBaseUrl for failed API calls

**No Metrics/Tracing:**
- No external metrics collection
- No distributed tracing
- No APM integration

## CI/CD & Deployment

**Hosting:**
- npm package: @merill/lokka
- Deployable as MCP server (stdio transport)
- Runs as Node.js process via `npx @merill/lokka` or packaged command

**CI Pipeline:**
- Not detected in codebase - build only via `npm run build` locally

**Package Distribution:**
- Published to npm registry as @merill/lokka
- Entry point: `build/main.js` (compiled TypeScript)
- Binary wrapper available as command `lokka`

## Environment Configuration

**Required Environment Variables by Auth Mode:**

Interactive Mode (default):
- Optional: TENANT_ID, CLIENT_ID, REDIRECT_URI (uses Lokka defaults if not provided)

Client Credentials Mode:
- Required: TENANT_ID, CLIENT_ID, CLIENT_SECRET

Certificate Mode:
- Required: TENANT_ID, CLIENT_ID, CERTIFICATE_PATH
- Optional: CERTIFICATE_PASSWORD

Client Provided Token Mode:
- Optional: ACCESS_TOKEN (can be provided later via set-access-token tool)

Global Options:
- Optional: USE_GRAPH_BETA (defaults to true, set to 'false' to use v1.0 instead of beta)

**Secrets Location:**
- Environment variables only - no .env file in codebase
- No secrets committed to repository (CERTIFICATE_PATH points to external file)

## Webhooks & Callbacks

**Incoming:**
- None - MCP server uses stdio transport for bidirectional communication with MCP client

**Outgoing:**
- Microsoft Graph API calls - GET, POST, PUT, PATCH, DELETE methods
- Azure Resource Manager API calls - GET, POST, PUT, PATCH, DELETE methods
- No webhook subscriptions or event-based callbacks implemented

**MCP Server Tools (Exposed as Callable Functions):**
1. `Lokka-Microsoft` - Main tool for Graph and Azure RM API calls
   - Parameters: apiType (graph/azure), path, method, queryParams, body, apiVersion, graphApiVersion, fetchAll, consistencyLevel
   - Returns: JSON response or error details

2. `set-access-token` - Update access token for client-provided token mode
   - Parameters: accessToken, expiresOn
   - Requires: USE_CLIENT_TOKEN=true

3. `get-auth-status` - Query authentication status and token details
   - Parameters: None
   - Returns: Auth mode, token status, scopes

4. `add-graph-permission` - Request additional Graph API permissions
   - Parameters: scopes (array of permission scope strings)
   - Requires: Interactive auth mode
   - Triggers fresh authentication flow

---

*Integration audit: 2026-04-01*
