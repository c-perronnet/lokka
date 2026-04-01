# Architecture

**Analysis Date:** 2026-04-01

## Pattern Overview

**Overall:** Model Context Protocol (MCP) Server with Multi-Auth Support and Dual API Integration

**Key Characteristics:**
- Implements Model Context Protocol server that exposes tools to AI clients (Claude Desktop, etc.)
- Provides abstraction layer over Microsoft Graph API and Azure Resource Management API
- Supports four independent authentication mechanisms with pluggable credential system
- Request-response architecture with pagination support for large result sets
- Single-threaded stdio-based communication with MCP clients

## Layers

**Entry Point & Server Layer:**
- Purpose: Initialize MCP server and manage tool definitions
- Location: `src/mcp/src/main.ts` (lines 14-30, 573-687)
- Contains: Server instantiation, stdio transport setup, environment variable processing
- Depends on: MCP SDK, authentication system, Azure Identity SDK
- Used by: MCP clients (Claude Desktop, VS Code, other MCP-aware clients)

**Tool Implementation Layer:**
- Purpose: Define and implement the three MCP tools exposed to clients
- Location: `src/mcp/src/main.ts` (lines 32-571)
- Contains: 
  - `Lokka-Microsoft` tool (lines 32-299): Main API query tool supporting Graph and Azure RM
  - `set-access-token` tool (lines 302-348): Token update for client-provided auth mode
  - `get-auth-status` tool (lines 350-382): Authentication status and capability reporting
  - `add-graph-permission` tool (lines 385-571): Interactive permission request tool
- Depends on: Authentication manager, Graph client, Zod for validation
- Used by: Client applications making API calls

**Authentication Layer:**
- Purpose: Manage multiple authentication mechanisms and provide credentials
- Location: `src/mcp/src/auth.ts` (all lines)
- Contains:
  - `AuthMode` enum: Defines four auth modes (ClientCredentials, ClientProvidedToken, Interactive, Certificate)
  - `AuthConfig` interface: Configuration for authentication
  - `AuthManager`: Main orchestrator for auth initialization and token management
  - `TokenCredentialAuthProvider`: Bridge between Azure Identity TokenCredential and Microsoft Graph AuthenticationProvider
  - `ClientProvidedTokenCredential`: Custom credential implementation for client-supplied tokens
  - JWT parsing utilities: Extract scopes from bearer tokens
- Depends on: Azure Identity SDK (@azure/identity), jsonwebtoken for JWT parsing
- Used by: Main tool layer for acquiring tokens and initializing Graph client

**API Integration Layer:**
- Purpose: Abstract Graph API and Azure RM API calls into unified interface
- Location: `src/mcp/src/main.ts` (lines 74-256)
- Contains:
  - Graph API request handling: Query construction, method dispatch, pagination
  - Azure RM request handling: Token acquisition, URL construction, manual pagination
  - Consistency level header management for advanced Graph queries
  - Response formatting and error handling
- Depends on: Graph client SDK, fetch API, Azure credential system
- Used by: Tool implementation layer

**Logging Layer:**
- Purpose: Centralized logging to file for debugging and audit
- Location: `src/mcp/src/logger.ts`
- Contains: Formatted file-based logging with timestamps
- Depends on: Node.js filesystem module
- Used by: All other layers for tracing execution

**Configuration & Constants:**
- Purpose: Centralize shared constants and default values
- Location: `src/mcp/src/constants.ts`
- Contains: Default Lokka client ID, tenant ID, redirect URI, Graph API version logic
- Depends on: Environment variables
- Used by: Authentication manager, server initialization

## Data Flow

**API Request Flow (Lokka-Microsoft Tool):**

1. MCP client calls `Lokka-Microsoft` tool with parameters (apiType, path, method, etc.)
2. Tool handler extracts parameters and determines effective Graph API version (considering USE_GRAPH_BETA env var)
3. Based on `apiType`:
   - **Graph path**: Use Graph SDK client initialized with authenticated provider, execute method (get/post/put/patch/delete)
   - **Azure path**: Acquire token from Azure credential, construct full URL with subscription/api-version, execute fetch request
4. If `fetchAll=true` for GET requests:
   - **Graph**: Use PageIterator to iterate through all pages, collect items, construct response with accumulated values
   - **Azure**: Manually follow nextLink in responses, accumulate results, return all values
5. Format response as JSON text with pagination notes
6. Return content to MCP client

**Authentication Initialization Flow:**

1. Server reads environment variables to determine auth mode
2. Creates `AuthManager` with `AuthConfig` containing mode and credentials
3. Calls `initialize()` on AuthManager:
   - Instantiates appropriate credential object (ClientSecretCredential, ClientCertificateCredential, InteractiveBrowserCredential, DeviceCodeCredential, or ClientProvidedTokenCredential)
   - Tests credential by acquiring a test token
4. Creates Graph client with `TokenCredentialAuthProvider` wrapping the credential
5. For client-token mode without initial token, skips initialization - token set later via `set-access-token` tool

**Token Update Flow (set-access-token Tool):**

1. Client calls `set-access-token` with new access token and optional expiration
2. Check if server is in ClientProvidedToken mode
3. Update the `ClientProvidedTokenCredential` instance with new token
4. Reinitialize Graph client with updated credential
5. Return success confirmation

**Permission Request Flow (add-graph-permission Tool):**

1. Client requests additional Graph scopes
2. Check if in Interactive mode (only supported mode)
3. Create new InteractiveBrowserCredential or DeviceCodeCredential with requested scopes
4. Request token with full scope string
5. Replace auth manager with new credential instance
6. Initialize new Graph client with updated credential
7. Return new token status including parsed scopes

**State Management:**

- `authManager`: Module-level singleton managing current authentication session (line 23)
- `graphClient`: Module-level singleton Graph SDK client (line 24)
- `useGraphBeta`, `defaultGraphApiVersion`: Determined once at startup (lines 27-28)
- Authentication state persists across multiple tool invocations within a session
- No per-request state; each request is independent

## Key Abstractions

**AuthManager:**
- Purpose: Encapsulates authentication logic and credential management
- Examples: `src/mcp/src/auth.ts` (line 121)
- Pattern: Singleton pattern with credential injection based on auth mode
- Methods: `initialize()`, `getGraphAuthProvider()`, `getAzureCredential()`, `getAuthMode()`, `updateAccessToken()`, `getTokenStatus()`

**TokenCredentialAuthProvider:**
- Purpose: Adapts Azure Identity TokenCredential interface to Microsoft Graph AuthenticationProvider interface
- Examples: `src/mcp/src/auth.ts` (line 42)
- Pattern: Adapter pattern bridging two SDK interfaces
- Responsibility: Implements async `getAccessToken()` by delegating to underlying TokenCredential

**ClientProvidedTokenCredential:**
- Purpose: Custom TokenCredential for externally-supplied tokens
- Examples: `src/mcp/src/auth.ts` (line 62)
- Pattern: TokenCredential interface implementation with mutable token state
- Methods: `getToken()`, `updateToken()`, `isExpired()`, `getExpirationTime()`

**MCPServer Tools:**
- Purpose: Expose capabilities to MCP clients as declarative tool definitions
- Examples: Lines 32-299 (Lokka-Microsoft), 302-348 (set-access-token), 350-382 (get-auth-status), 385-571 (add-graph-permission)
- Pattern: Zod-validated input schemas with async handler functions
- Each tool: Name, description, input schema (Zod), handler function returning content array or error

## Entry Points

**Server Startup:**
- Location: `src/mcp/src/main.ts` line 573-687 (`main()` function)
- Triggers: Process invocation via npm/npx
- Responsibilities: 
  - Determine auth mode from environment variables
  - Validate auth configuration
  - Create and initialize AuthManager
  - Initialize Graph client
  - Create MCP server with stdio transport
  - Connect to MCP transport and await commands

**Tool Handlers:**
- `Lokka-Microsoft` (line 32): Main API query tool
  - Triggers: MCP client calls tool
  - Responsibilities: Route to Graph or Azure RM, execute request, paginate if needed, return formatted result
  
- `set-access-token` (line 302): Token management tool
  - Triggers: MCP client calls tool
  - Responsibilities: Update credential and Graph client if in client-token mode
  
- `get-auth-status` (line 350): Auth status check tool
  - Triggers: MCP client calls tool
  - Responsibilities: Report auth mode, readiness, token status, parsed scopes
  
- `add-graph-permission` (line 385): Interactive permission request tool
  - Triggers: MCP client calls tool
  - Responsibilities: Trigger fresh interactive auth with new scopes in supported modes

## Error Handling

**Strategy:** Try-catch with detailed error reporting

**Patterns:**

1. **Validation Errors**: Zod schemas validate tool inputs before handler execution - schema validation failures return error immediately

2. **API Errors**: 
   - Graph SDK throws on HTTP errors - caught and re-thrown with status code and error body
   - Azure RM fetch responses checked for `.ok` property - non-ok responses throw with status and body
   - All API errors include attempted URL for debugging

3. **Auth Errors**:
   - Credential initialization failures throw during `initialize()`
   - Token acquisition failures throw with specific message (e.g., "Failed to acquire access token")
   - Invalid auth config (missing required fields) throws with descriptive message
   - Token expiration in ClientProvidedTokenCredential returns `null` from `getToken()`

4. **Error Response Format**:
   - Tool handlers catch errors and return structured error JSON
   - Includes: error message, status code (if available), error body, attempted URL
   - Sets `isError: true` flag in response

5. **Logging**:
   - All errors logged to `mcp-server.log` with timestamp and context
   - Error logging includes original error object for stack traces

## Cross-Cutting Concerns

**Logging:** 
- File-based structured logging to `src/mcp/src/mcp-server.log`
- Called from all layers: server init, auth operations, API requests, error handlers
- Format: `[ISO-timestamp] [LEVEL] message\nJSON data if present`
- Used for debugging authentication failures and API errors

**Validation:** 
- Zod schemas for all tool inputs (lines 35-46 for Lokka-Microsoft, etc.)
- Schemas validate enum values (apiType, method, graphApiVersion)
- Optional fields handled with `.optional()` and defaults with `.default()`
- Invalid inputs rejected before handler execution

**Authentication:** 
- Centralized AuthManager handles all credential logic
- Four independent modes with different environment variable requirements
- Mode determined at startup based on env vars - cannot change without restart
- All API requests use credentials from AuthManager

**Graph API Version Control:**
- Default to `beta` unless `USE_GRAPH_BETA=false` is set
- Can be overridden per-request via `graphApiVersion` parameter
- If `USE_GRAPH_BETA=false`, all requests forced to `v1.0` regardless of parameter
- Logged at server startup and per request

**Pagination:**
- Graph API: Uses SDK's `PageIterator` for automatic pagination
- Azure RM: Manual pagination by following `nextLink` in responses
- Only active when `fetchAll=true` - single page returned otherwise
- Response includes pagination hint if more results available

---

*Architecture analysis: 2026-04-01*
