# Technology Stack

**Analysis Date:** 2026-04-01

## Languages

**Primary:**
- TypeScript 5.8.2 - All MCP server and application code
- JavaScript (ECMAScript modules) - Runtime execution via Node.js

**Secondary:**
- Markdown - Documentation and website content
- JSON - Configuration and package manifests

## Runtime

**Environment:**
- Node.js 18.0+ (required)
- Uses ES2022 target with ES modules (type: "module")

**Package Manager:**
- npm
- Lockfile: `src/mcp/package-lock.json` and `website/package-lock.json` present

## Frameworks

**Core:**
- @modelcontextprotocol/sdk 1.7.0 - MCP server framework and stdio transport
- @microsoft/microsoft-graph-client 3.0.7 - Microsoft Graph API client with pagination support

**Build/Dev:**
- TypeScript 5.8.2 - Language compilation (strict mode enabled)
- tsc (TypeScript compiler) - Compilation to ES2022

**Documentation:**
- Docusaurus 3.7.0 - Documentation website generation
- React 19.0.0 - UI framework for website

## Key Dependencies

**Critical:**
- @azure/identity 4.3.0 - Azure authentication provider with support for multiple auth modes (interactive, certificate, client credentials, token-based)
- @microsoft/microsoft-graph-client 3.0.7 - Graph API client with pagination (PageIterator, PageCollection)
- @modelcontextprotocol/sdk 1.7.0 - MCP server SDK for tool registration and stdio communication
- isomorphic-fetch 3.0.0 - Fetch polyfill required by Microsoft Graph client for Node.js environment
- jsonwebtoken 9.0.2 - JWT parsing for token scope extraction
- zod 3.24.2 - Schema validation for MCP tool parameters

**Website:**
- @mdx-js/react 3.0.0 - Markdown + JSX for documentation
- prism-react-renderer 2.3.0 - Code syntax highlighting
- clsx 2.0.0 - Conditional CSS class composition

## Configuration

**Environment Variables:**
Authentication configuration via environment variables (no explicit .env file required):
- `USE_INTERACTIVE` - Enable interactive browser/device code authentication
- `USE_CERTIFICATE` - Enable certificate-based authentication
- `USE_CLIENT_TOKEN` - Enable client-provided token mode
- `TENANT_ID` - Azure tenant ID (optional for interactive mode with default, required for other modes)
- `CLIENT_ID` - Azure app registration client ID (optional for interactive mode with default, required for other modes)
- `CLIENT_SECRET` - Client secret for client credentials mode
- `CERTIFICATE_PATH` - Path to PEM certificate file for certificate auth
- `CERTIFICATE_PASSWORD` - Optional password for certificate
- `ACCESS_TOKEN` - Initial access token for client provided token mode
- `REDIRECT_URI` - Redirect URI for interactive auth (defaults to http://localhost:3000)
- `USE_GRAPH_BETA` - Use Graph API beta version (defaults to true unless explicitly set to 'false')

**Build Configuration:**
- `src/mcp/tsconfig.json` - TypeScript compiler configuration with strict mode
  - Target: ES2022
  - Module: Node16
  - Output: `./build` directory
  - Strict type checking enabled

## Platform Requirements

**Development:**
- Node.js 18.0 or higher
- npm for dependency management
- TypeScript compiler (`npm run build` to compile)
- Unix-like shell for build scripts (or Windows with bash)

**Production:**
- Node.js 18.0 or higher runtime
- Stdio transport for MCP communication (integration with MCP clients like Claude Desktop)
- Microsoft Azure tenant access with appropriate permissions
- Valid Azure app registration for authentication
- Network access to `https://graph.microsoft.com` and `https://management.azure.com`

**Entry Points:**
- `src/mcp/build/main.js` - Compiled executable (created by `npm run build`)
- `src/mcp/src/main.ts` - Source TypeScript entry point
- Binary distribution: Published to npm as `@merill/lokka`

---

*Stack analysis: 2026-04-01*
