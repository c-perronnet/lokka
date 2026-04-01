# Coding Conventions

**Analysis Date:** 2026-04-01

## Naming Patterns

**Files:**
- Use kebab-case for filenames: `main.ts`, `auth.ts`, `logger.ts`, `constants.ts`
- Tests run directly via npm scripts as manual verification (e.g., `test:token`, `test:simple`, `test:live`)

**Functions:**
- Use camelCase for function names: `parseJwtScopes()`, `formatMessage()`, `getToken()`
- Use verb-first naming for async functions: `initialize()`, `testCredential()`, `getAccessToken()`
- Helper functions prefixed with action verb: `formatMessage()`, `parseJwtScopes()`

**Variables:**
- Use camelCase for all variable declarations: `authManager`, `graphClient`, `responseData`, `accessToken`
- Use UPPER_SNAKE_CASE for constants: `ONE_HOUR_IN_MS`, `LOG_FILE`
- Use boolean-specific prefixes: `useGraphBeta`, `useCertificate`, `useInteractive`, `useClientToken`, `hasClientCredentials`

**Types:**
- Use PascalCase for interfaces: `AuthenticationProvider`, `TokenCredential`, `TokenBasedCredential`, `AuthConfig`
- Use PascalCase for enums: `AuthMode`
- Use PascalCase for classes: `TokenCredentialAuthProvider`, `ClientProvidedTokenCredential`, `AuthManager`, `McpServer`

## Code Style

**Formatting:**
- No explicit formatter configured (no .prettierrc or eslint config found)
- TypeScript strict mode enabled via tsconfig.json
- Target: ES2022, Module: Node16, ModuleResolution: Node16

**Linting:**
- No linter configuration present
- Code relies on TypeScript compiler for type safety
- Manual code review approach assumed

**TypeScript Configuration (`tsconfig.json`):**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Import Organization

**Order:**
1. External packages (third-party libraries): `@azure`, `@microsoft`, `@modelcontextprotocol`
2. Standard library imports: `fs`, `path`
3. Local imports with relative paths: `./logger.js`, `./auth.js`, `./constants.js`

**Path Aliases:**
- Not used. All local imports use relative paths with `.js` extensions
- Example: `import { logger } from "./logger.js";`

**Module System:**
- ESM (ES modules) with Node16 resolution
- All imports include `.js` extension for Node.js compatibility
- Type imports use `import type` pattern where appropriate

## Error Handling

**Patterns:**
- Explicit null/undefined checks before dereferencing: 
  ```typescript
  if (!graphClient) {
    throw new Error("Graph client not initialized");
  }
  ```
- Try-catch blocks with specific error messaging
- Error responses return structured format with `isError: true` flag:
  ```typescript
  return {
    content: [{ type: "text" as const, text: errorMessage }],
    isError: true
  };
  ```
- Distinction between validation errors and unexpected errors
- Early return pattern for validation failures

**Error Message Quality:**
- Include context about what failed: `Error in Lokka-Microsoft tool (apiType: ${apiType}, path: ${path}, method: ${method})`
- Provide actionable remediation steps in error messages
- Log full error objects, not just message strings

## Logging

**Framework:** Custom file-based logger (not Winston, Pino, or other library)

**Implementation:** `src/mcp/src/logger.ts`

**Patterns:**
- Use `logger.info()` for informational messages
- Use `logger.error()` for errors with context
- All log messages include ISO timestamp and log level
- Error logging automatically includes JSON-stringified error objects
- Logs append to `mcp-server.log` in the same directory as logger.ts

**Example:**
```typescript
logger.info(`Executing Lokka-Microsoft tool with params: apiType=${apiType}, path=${path}, method=${method}`);
logger.error(`Error in Lokka-Microsoft tool (apiType: ${apiType}, path: ${path}, method: ${method}):`, error);
```

**Log Format:**
```
[2026-04-01T10:30:45.123Z] [INFO] message text
[2026-04-01T10:30:45.456Z] [ERROR] error message
{
  "errorDetails": "..."
}
```

## Comments

**When to Comment:**
- Explain "why" decisions: `// Set up global fetch for the Microsoft Graph client`
- Document SDK behavior: `// Decode JWT without verifying signature (we trust the token from Azure Identity)`
- Mark known limitations: `// Delete often returns no body or 204`
- Explain non-obvious code branches: `// Override graphApiVersion if USE_GRAPH_BETA is explicitly set to false`

**JSDoc/TSDoc:**
- Not used in this codebase
- No function-level documentation comments
- Focus on inline clarity instead

## Function Design

**Size:** No explicit limit, but typical functions are 30-150 lines
- Large switch statements allowed for handling multiple API methods (e.g., GET, POST, PUT, PATCH, DELETE)
- Pagination logic can span 40+ lines when handling both Graph and Azure RM

**Parameters:**
- Use object destructuring for multiple parameters:
  ```typescript
  async ({
    apiType,
    path,
    method,
    apiVersion,
    subscriptionId,
    queryParams,
    body,
    graphApiVersion,
    fetchAll,
    consistencyLevel
  }: {
    apiType: "graph" | "azure";
    path: string;
    // ... type definitions
  }) => { ... }
  ```
- Zod for schema validation of tool inputs (from MCP SDK)

**Return Values:**
- Tool handlers return object with `content` array and optional `isError` flag:
  ```typescript
  return {
    content: [{ type: "text" as const, text: resultText }],
  };
  ```
- Functions throw errors for exceptional cases
- Explicit `type: "text" as const` TypeScript casting for type narrowing

## Module Design

**Exports:**
- Named exports preferred: `export class AuthManager`, `export interface AuthConfig`
- Single default export for logger object:
  ```typescript
  export const logger = { info(), error() };
  ```
- Export patterns depend on usage context

**Barrel Files:**
- Not used. Direct imports from specific files only

**Class Methods:**
- Public methods exposed without underscore prefix
- Private implementation details marked with `private` keyword
- Helper methods like `testCredential()` called during initialization

## Environment Variables

**Naming Convention:**
- UPPER_SNAKE_CASE: `USE_GRAPH_BETA`, `USE_CERTIFICATE`, `USE_INTERACTIVE`, `USE_CLIENT_TOKEN`, `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`
- Boolean flags default to explicit string values: `'true'`, `'false'` (string comparison required)

**Access Pattern:**
- Direct access via `process.env.VARIABLE_NAME`
- Nullish coalescing for defaults: `process.env.TENANT_ID || LokkaDefaultTenantId`

## Type Annotations

**General Rule:** TypeScript strict mode enabled, types required

**Explicit Typing:**
- Function parameters always typed
- Return types specified for complex functions
- `any` type avoided in favor of `unknown` for truly dynamic data, then narrowed
- Union types used for discriminated unions: `apiType: "graph" | "azure"`

---

*Convention analysis: 2026-04-01*
