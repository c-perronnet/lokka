# Testing Patterns

**Analysis Date:** 2026-04-01

## Test Framework

**Runner:**
- No automated test framework (Jest, Vitest, Mocha not configured)
- Manual testing via npm scripts
- Node.js runtime execution only

**Run Commands:**
```bash
npm run test:token          # Test token-based authentication flow
npm run test:simple         # Run simple token test
npm run test:live           # Run live API test against Microsoft Graph
npm run demo:token          # Demo token authentication
```

These commands execute compiled JavaScript files directly via Node.js from the `build/` directory.

## Test File Organization

**Location:**
- Test files are executed as standalone Node.js scripts in build output
- No co-located test files (no `.test.ts` or `.spec.ts` files in src/)
- Manual test scripts exist but are not tracked in version control as test files

**Naming:**
- Format: `test-*.js`, `demo-*.js` (compiled from TypeScript)
- Location: `build/` directory (compiled output only)

**Testing Approach:**
- Manual verification approach: developers run scripts and inspect output
- No automated assertion framework
- Console logging for test results
- HTTP requests made against real or test Microsoft Graph endpoints

## Test Structure

**Integration Testing Pattern:**

Each npm script runs a Node.js file that:
1. Initializes authentication (AuthManager)
2. Acquires an access token
3. Makes a real API call to Microsoft Graph or Azure RM
4. Logs results or errors to console/file

**Example Test Execution Flow:**
```
1. Build TypeScript: npm run build
2. Run test script: npm run test:token
3. Script loads: build/test-token-auth.js
4. Script executes: initialize auth -> get token -> make API call
5. Results printed to console
```

## Mocking

**Framework:** None

**Patterns:**
- No mocking library used (no Jest mocks, Sinon, or similar)
- Tests use real HTTP calls against actual APIs
- Token-based tests may use provided access tokens for isolation

**What to Mock:**
- Network calls cannot be mocked in current setup
- Would require adding Jest/Vitest and MSW or nock if mocking needed

**What NOT to Mock:**
- All infrastructure is real in current testing approach
- Tests verify actual API integration

## Authentication Testing

**Token Testing Pattern (`src/mcp/TESTING.md`):**

```bash
# Option 1: Using Azure CLI token
az login
az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv

# Option 2: Graph Explorer token
# Navigate to https://developer.microsoft.com/en-us/graph/graph-explorer
# Extract token from browser Network tab Authorization header
```

Tokens are obtained manually, then passed to test scripts via environment variables or command-line arguments.

## Manual Test Coverage

**Areas Tested via Scripts:**
- Token acquisition and validation
- Access token expiration handling
- Microsoft Graph API calls (authenticated)
- Azure Resource Management API calls
- Authentication mode switching (Interactive, Certificate, Client Credentials)
- Permission scope handling

## Fixtures and Factories

**Test Data:**
- Not used. Live API responses serve as test data
- No factory functions for generating test objects

**Location:**
- N/A - fixtures not implemented

## Coverage

**Requirements:** None enforced

**Approach:**
- No coverage metrics collected
- Manual spot-check of key code paths
- API integration tested via live calls

## Test Types

**Manual Integration Tests:**
- `npm run test:token`: Token-based authentication flow
- `npm run test:simple`: Simplified token test
- `npm run test:live`: Live Microsoft Graph API queries

These test real authentication and API integration without mocking.

**Unit Tests:**
- Not implemented
- Would require Jest/Vitest configuration

**E2E Tests:**
- Not applicable. MCP server runs as subprocess in client environments.
- Live API integration tests serve similar purpose.

## Authentication Testing Patterns

**Client Provided Token Mode:**
```typescript
// From auth.ts - ClientProvidedTokenCredential
class ClientProvidedTokenCredential implements TokenBasedCredential {
  async getToken(scopes: string | string[]): Promise<AccessToken | null> {
    if (!this.accessToken || !this.expiresOn || this.expiresOn <= new Date()) {
      logger.error("Access token is not available or has expired");
      return null;
    }
    return {
      token: this.accessToken,
      expiresOnTimestamp: this.expiresOn.getTime()
    };
  }
}
```

Testing approach: Provide token via `ACCESS_TOKEN` env var, verify client can use it.

**Interactive Authentication:**
```typescript
// From auth.ts - AuthManager.initialize()
case AuthMode.Interactive:
  try {
    this.credential = new InteractiveBrowserCredential({
      tenantId: tenantId,
      clientId: clientId,
      redirectUri: this.config.redirectUri || LokkaDefaultRedirectUri,
    });
  } catch (error) {
    // Fallback to Device Code flow
    this.credential = new DeviceCodeCredential({
      tenantId: tenantId,
      clientId: clientId,
      userPromptCallback: (info: DeviceCodeInfo) => {
        console.log(`\n🔐 Authentication Required:`);
        console.log(`Please visit: ${info.verificationUri}`);
        console.log(`And enter code: ${info.userCode}\n`);
        return Promise.resolve();
      },
    });
  }
```

Testing approach: Run script, follow device code or browser flow, verify token obtained.

**Certificate Authentication:**
```typescript
case AuthMode.Certificate:
  this.credential = new ClientCertificateCredential(
    this.config.tenantId, 
    this.config.clientId, 
    {
      certificatePath: this.config.certificatePath,
      certificatePassword: this.config.certificatePassword
    }
  );
```

Testing approach: Provide certificate file path and optional password via env vars.

**Client Credentials:**
```typescript
case AuthMode.ClientCredentials:
  this.credential = new ClientSecretCredential(
    this.config.tenantId,
    this.config.clientId,
    this.config.clientSecret
  );
```

Testing approach: Set TENANT_ID, CLIENT_ID, CLIENT_SECRET env vars.

## Error Testing

**Pattern:**
No structured error testing. Errors tested implicitly by:
1. Providing invalid tokens (expect "not available or has expired")
2. Using invalid API paths (expect 404 errors from Graph API)
3. Using invalid scopes (expect permission denied errors)
4. Allowing tokens to expire (expect re-authentication required)

**Example from auth.ts:**
```typescript
private async testCredential(): Promise<void> {
  if (!this.credential) {
    throw new Error("Credential not initialized");
  }

  // Skip testing if ClientProvidedToken mode has no initial token
  if (this.config.mode === AuthMode.ClientProvidedToken && !this.config.accessToken) {
    logger.info("Skipping initial credential test as no token was provided at startup.");
    return;
  }

  try {
    const token = await this.credential.getToken("https://graph.microsoft.com/.default");
    if (!token) {
      throw new Error("Failed to acquire token");
    }
    logger.info("Authentication successful");
  } catch (error) {
    logger.error("Authentication test failed", error);
    throw error;
  }
}
```

## Debugging Test Results

**Log File:**
- Location: `src/mcp/src/mcp-server.log` (or wherever logger is instantiated)
- Contains all `logger.info()` and `logger.error()` calls
- ISO timestamp + level + message + JSON data

**Console Output:**
- Test scripts print to stdout/stderr
- Device code flows print authentication URLs and codes
- Error messages include context and remediation steps

## Recommended Testing Strategy

When adding new code:

1. **For new authentication modes:**
   - Create a test script in `build/` directory
   - Initialize AuthManager with new config
   - Verify token acquisition with `testCredential()`
   - Test API call with acquired token

2. **For new API endpoints:**
   - Add to test script parameters
   - Call via `Lokka-Microsoft` tool
   - Verify response structure matches expected shape
   - Check pagination if list endpoint

3. **For error cases:**
   - Provide invalid input to tools
   - Verify error response structure: `{ isError: true, content: [{type: "text", text: errorMessage}] }`
   - Check error message includes context and remediation

---

*Testing analysis: 2026-04-01*
