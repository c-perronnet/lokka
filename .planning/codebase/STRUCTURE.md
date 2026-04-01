# Codebase Structure

**Analysis Date:** 2026-04-01

## Directory Layout

```
lokka/
├── .claude/              # Claude IDE settings
├── .planning/            # GSD planning documents
│   └── codebase/         # Architecture analysis documents
├── assets/               # Visual assets for documentation
├── src/
│   └── mcp/              # MCP Server implementation
│       ├── src/          # TypeScript source files
│       │   ├── main.ts           # Server entry point, tool implementations
│       │   ├── auth.ts           # Authentication system
│       │   ├── logger.ts         # Logging utilities
│       │   └── constants.ts      # Shared constants
│       ├── build/        # Compiled JavaScript output (generated)
│       ├── package.json  # NPM package manifest
│       ├── tsconfig.json # TypeScript configuration
│       └── package-lock.json
├── website/              # Docusaurus documentation site
│   ├── docs/             # Markdown documentation pages
│   │   ├── install-advanced/     # Advanced installation guides
│   │   └── assets/               # Documentation images
│   ├── blog/             # Blog posts
│   ├── src/              # Docusaurus site components
│   │   ├── pages/        # Custom pages
│   │   └── css/          # Custom styles
│   ├── static/           # Static assets
│   │   └── img/          # Images
│   ├── docusaurus.config.js      # Docusaurus configuration
│   ├── package.json      # Website dependencies
│   └── package-lock.json
├── README.md             # Project overview and setup
├── LICENSE               # MIT license
└── .gitignore            # Git ignore rules
```

## Directory Purposes

**`src/mcp/`:**
- Purpose: Core MCP server application
- Contains: TypeScript source, compiled output, NPM configuration
- Key files: `src/main.ts` (primary logic), `src/auth.ts` (credential management)

**`src/mcp/src/`:**
- Purpose: TypeScript source code
- Contains: Main server logic, authentication, logging, configuration
- Key files: `main.ts` (1,048 total lines across all source files)

**`src/mcp/build/`:**
- Purpose: Compiled JavaScript output from TypeScript
- Contains: `main.js` (entry point for npm/npx execution)
- Generated: Yes (by `npm run build`)
- Committed: No (generated files excluded from git)

**`website/`:**
- Purpose: Docusaurus documentation site (published to lokka.dev)
- Contains: Markdown docs, blog posts, site configuration
- Key files: `docs/` (installation, usage guides), `docusaurus.config.js` (site config)

**`website/docs/`:**
- Purpose: User-facing documentation
- Contains: Markdown files for install guides, developer guides, API reference
- Key files: `install-advanced/` (advanced configuration examples)

**`website/blog/`:**
- Purpose: Blog posts and announcements
- Contains: Markdown blog entries with date-prefixed directories
- Key files: `2021-08-26-welcome/` (initial blog post)

**`website/src/`:**
- Purpose: Site components and styling
- Contains: React components, custom CSS, custom pages
- Key files: `pages/` (custom React pages), `css/` (site styling)

**`.planning/codebase/`:**
- Purpose: Architecture analysis documents (GSD system)
- Contains: ARCHITECTURE.md, STRUCTURE.md, and focus-area specific docs
- Generated: Yes (by GSD mapping commands)
- Committed: Yes (consumed by GSD planning/execution)

## Key File Locations

**Entry Points:**
- `src/mcp/src/main.ts`: MCP server application entry point (shebang at line 1)
- `src/mcp/build/main.js`: Compiled JavaScript entry point (referenced by npm bin)
- `website/docusaurus.config.js`: Documentation site configuration

**Configuration:**
- `src/mcp/package.json`: NPM package manifest with scripts and dependencies
- `src/mcp/tsconfig.json`: TypeScript compiler options (target: ES2022, strict mode)
- `website/package.json`: Documentation site dependencies (Docusaurus 3.7.0)
- `README.md`: Project overview, authentication methods, installation instructions

**Core Logic:**
- `src/mcp/src/main.ts`: Server initialization, tool definitions, Graph/Azure RM API logic
- `src/mcp/src/auth.ts`: Authentication manager, credential implementations (4 modes)
- `src/mcp/src/logger.ts`: File-based logging to `mcp-server.log`
- `src/mcp/src/constants.ts`: Default values and Graph API version logic

**Documentation:**
- `website/docs/`: Installation guides, developer guide, FAQ
- `website/blog/`: Announcements and release notes
- `README.md`: Quick reference for auth methods and configuration

## Naming Conventions

**Files:**
- Source files: camelCase with .ts extension (e.g., `main.ts`, `auth.ts`)
- Compiled files: same name in `build/` with .js extension
- Documentation: kebab-case with .md extension (e.g., `install-advanced.md`)
- Blog entries: date-prefixed in ISO format (e.g., `2021-08-26-welcome`)
- Log files: `mcp-server.log` (created at runtime)

**Directories:**
- Source: lowercase plural or descriptive (e.g., `src`, `build`, `docs`, `blog`)
- NPM scope: @merill (organization-prefixed package name)
- System: snake_case for generated/system directories (e.g., `.planning`, `.claude`)

**Code:**
- Functions: camelCase (e.g., `parseJwtScopes()`, `getAuthStatus()`)
- Classes: PascalCase (e.g., `AuthManager`, `TokenCredentialAuthProvider`, `ClientProvidedTokenCredential`)
- Constants: UPPER_SNAKE_CASE (e.g., `ONE_HOUR_IN_MS`, `LokkaClientId`)
- Enums: PascalCase members (e.g., `AuthMode.ClientCredentials`)
- Interfaces: PascalCase with I prefix not used (e.g., `AuthConfig`, `TokenBasedCredential`)

## Where to Add New Code

**New Tool:**
- Implementation: Add tool registration in `src/mcp/src/main.ts` after line 385 (following `add-graph-permission` pattern)
- Input schema: Use Zod validation with `.describe()` for each parameter
- Handler: Async function returning `{ content: [...], isError?: boolean }`
- Test: Add manual test script in `src/mcp/` if needed

**New Authentication Mode:**
- Credential class: Add to `src/mcp/src/auth.ts` implementing `TokenCredential` or `TokenBasedCredential` interface
- Auth mode enum: Add to `AuthMode` enum in `auth.ts`
- Initialization: Add case in `AuthManager.initialize()` switch statement
- Env vars: Document in `src/mcp/src/main.ts` env var validation section (lines 640-648)
- README update: Add configuration example to `README.md`

**Utility Functions:**
- Shared utilities: Add to appropriate module (`auth.ts`, `logger.ts`, `constants.ts`)
- JWT parsing helper: Located in `src/mcp/src/auth.ts` line 11 (reuse `parseJwtScopes()`)
- API-specific helpers: Add to `main.ts` before tool implementations

**Documentation:**
- User guides: Add Markdown to `website/docs/`
- Blog posts: Add to `website/blog/` in date-prefixed directory
- Update website config: `website/docusaurus.config.js` for navigation

**Tests:**
- Integration tests: Create `src/mcp/src/test-*.ts` file (pattern used: `test-token-auth.ts`)
- Demo scripts: Create `src/mcp/src/demo-*.ts` file (pattern used: `demo-token-auth.ts`)
- Run with: `npm run test:token`, `npm run demo:token`, `npm run test:live`

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD system codebase analysis documents
- Generated: Yes (by `/gsd:map-codebase` command)
- Committed: Yes (consumed by `/gsd:plan-phase` and `/gsd:execute-phase`)
- Contents: ARCHITECTURE.md, STRUCTURE.md, plus focus-area specific docs

**`src/mcp/build/`:**
- Purpose: TypeScript compilation output
- Generated: Yes (by `npm run build` or `npm run build:unix`)
- Committed: No (.gitignore excludes build artifacts)
- Binary: `build/main.js` is executable (chmod 755 on Unix via `npm run build:unix`)

**`website/static/`:**
- Purpose: Copied as-is to build output, served directly by Docusaurus
- Generated: No
- Committed: Yes (images, favicons, etc.)
- Contents: Images, static assets referenced in docs

**Root configuration:**
- `.mcp.json`: MCP server registration for IDE integration
- `.claude/settings.local.json`: Claude IDE workspace settings
- `.gitignore`: Excludes node_modules, build artifacts, env files

## Build & Package Structure

**Compilation:**
- Input: `src/mcp/src/**/*.ts`
- Output: `src/mcp/build/**/*.js`
- Command: `npm run build` (runs `tsc`)
- Config: `src/mcp/tsconfig.json` (target ES2022, moduleResolution Node16)

**Package Distribution:**
- Package name: `@merill/lokka` (published to NPM)
- Entry point: `build/main.js` (via `main` field in package.json)
- Binary: `build/main.js` (executable, registered as `lokka` bin)
- Files included: Only `build/` directory (via `files` field in package.json)

**Running:**
- Direct: `node src/mcp/build/main.js` (after npm run build)
- NPM: `npm start` (runs build/main.js)
- NPX global: `npx @merill/lokka` (downloads and runs latest published version)

---

*Structure analysis: 2026-04-01*
