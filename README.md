# Lokka

[![npm version](https://badge.fury.io/js/@merill%2Flokka.svg)](https://badge.fury.io/js/@merill%2Flokka)

Lokka is a model-context-protocol server for the Microsoft Graph, Azure RM, and Microsoft Defender for Endpoint APIs that allows you to query and manage your Azure and Microsoft 365 tenants with AI.

<img src="https://github.com/merill/lokka/blob/main/assets/lokka-demo-1.gif?raw=true" alt="Lokka Demo - user create demo" width="500"/>

Please see [Lokka.dev](https://lokka.dev) for how to use Lokka with your favorite AI model and chat client.

Lokka lets you use Claude Desktop, or any MCP Client, to use natural language to accomplish things in your Azure and Microsoft 365 tenant through the Microsoft APIs.

e.g.:

- `Create a new security group called 'Sales and HR' with a dynamic rule based on the department attribute.` 
- `Find all the conditional access policies that haven't excluded the emergency access account`
- `Show me all the Intune device configuration policies assigned to the 'Call center' group`
- `What was the most expensive service in Azure last month?`
- `List all Defender machines with a high risk score`
- `Show me all Windows 10 devices that haven't been seen in the last 30 days`
- `Get the health status of machine DESKTOP-ABC123`

![How does Lokka work?](https://github.com/merill/lokka/blob/main/website/docs/assets/how-does-lokka-mcp-server-work.png?raw=true)

## Supported APIs

### Microsoft Graph (`apiType: "graph"`)

Query and manage Microsoft 365 and Entra ID resources.

- Users, groups, applications, service principals
- Conditional access policies
- Intune device configurations
- Mail, calendar, Teams
- Any Microsoft Graph endpoint

### Azure Resource Management (`apiType: "azure"`)

Query and manage Azure infrastructure.

- Subscriptions, resource groups, resources
- Virtual machines, storage accounts, networking
- Cost management and billing
- Any Azure RM endpoint

### Microsoft Defender for Endpoint (`apiType: "defender"`)

Read-only access to device inventory and security posture.

- **List machines** — `/api/machines` with pagination (`$top`, `$skip`, `fetchAll: true`)
- **Get machine by ID** — `/api/machines/{id}`
- **Search by DNS name** — `$filter=startswith(computerDnsName,'prefix')`
- **Filter by 9 fields** — healthStatus, riskScore, exposureLevel, osPlatform, onboardingStatus, lastSeen, machineTags, lastIpAddress, computerDnsName
- **Read-only** — only GET requests are allowed; non-GET methods return a clear error
- **EU data residency** — hardcoded to `eu.api.security.microsoft.com`
- **Rate limit handling** — 429 responses are retried with exponential backoff
- **Actionable error messages** — auth failures (401/403) explain the likely cause

#### Defender filter examples

| Filter | Query |
|--------|-------|
| Active machines | `$filter=healthStatus eq 'Active'` |
| High risk | `$filter=riskScore eq 'High'` |
| Windows 10 | `$filter=osPlatform eq 'Windows10'` |
| Not seen recently | `$filter=lastSeen lt 2024-06-01T00:00:00Z` |
| By DNS prefix | `$filter=startswith(computerDnsName,'SRV-')` |
| By tag | `$filter=machineTags/any(tag: tag eq 'critical')` |
| By IP | `$filter=lastIpAddress eq '10.0.0.5'` |
| Combined | `$filter=osPlatform eq 'Windows10' and riskScore eq 'High'` |

#### Defender permissions setup

The app registration needs the **WindowsDefenderATP** API permission:

1. Azure Portal > App registrations > your Lokka app
2. API permissions > Add a permission > APIs my organization uses > search **WindowsDefenderATP**
3. Application permissions > `Machine.Read.All` (or `Machine.ReadWrite.All`)
4. Click **Grant admin consent**

The token scope is `https://api.securitycenter.microsoft.com/.default` (not `https://api.security.microsoft.com/.default` — these are different strings).

## Authentication Methods

Lokka supports multiple authentication methods to accommodate different deployment scenarios.

### Interactive Auth

For user-based authentication with interactive login. This is the simplest config and uses the default Lokka app.

```json
{
  "mcpServers": {
    "Lokka-Microsoft": {
      "command": "npx",
      "args": ["-y", "@merill/lokka"]
    }
  }
}
```

#### Interactive auth with custom app

If you wish to use a custom Microsoft Entra app:

```json
{
  "mcpServers": {
    "Lokka-Microsoft": {
      "command": "npx",
      "args": ["-y", "@merill/lokka"],
      "env": {
        "TENANT_ID": "<tenant-id>",
        "CLIENT_ID": "<client-id>",
        "USE_INTERACTIVE": "true"
      }
    }
  }
}
```

### App-Only Auth

Traditional app-only authentication. See [Install Guide](https://lokka.dev/docs/install) for how to create an Entra app.

#### App-Only Auth with Certificate

App only authentication using a PEM-encoded client certificate:

```json
{
  "mcpServers": {
    "Lokka-Microsoft": {
      "command": "npx",
      "args": ["-y", "@merill/lokka"],
      "env": {
        "TENANT_ID": "<tenant-id>",
        "CLIENT_ID": "<client-id>",
        "CERTIFICATE_PATH": "/path/to/certificate.pem",
        "CERTIFICATE_PASSWORD": "<optional-certificate-password>",
        "USE_CERTIFICATE": "true"
      }
    }
  }
}
```

To convert a PFX certificate to PEM:

```bash
openssl pkcs12 -in /path/to/cert.pfx -out /path/to/cert.pem -nodes -clcerts
```

#### App-Only Auth with Client Secret

```json
{
  "mcpServers": {
    "Lokka-Microsoft": {
      "command": "npx",
      "args": ["-y", "@merill/lokka"],
      "env": {
        "TENANT_ID": "<tenant-id>",
        "CLIENT_ID": "<client-id>",
        "CLIENT_SECRET": "<client-secret>"
      }
    }
  }
}
```

### Client-Provided Token

Token-based authentication where the MCP Client provides access tokens:

```json
{
  "mcpServers": {
    "Lokka-Microsoft": {
      "command": "npx",
      "args": ["-y", "@merill/lokka"],
      "env": {
        "USE_CLIENT_TOKEN": "true"
      }
    }
  }
}
```

When using client-provided token mode:

1. Start the MCP server with `USE_CLIENT_TOKEN=true`
2. Use the `set-access-token` tool to provide a valid Microsoft Graph access token
3. Use the `get-auth-status` tool to verify authentication status
4. Refresh tokens as needed using `set-access-token`

## Tools

### `Lokka-Microsoft`

The main tool for querying Microsoft APIs. Supports Microsoft Graph, Azure RM, and Defender for Endpoint.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `apiType` | `"graph"` \| `"azure"` \| `"defender"` | Yes | Which Microsoft API to query |
| `path` | string | Yes | API URL path (e.g., `/users`, `/subscriptions`, `/api/machines`) |
| `method` | `"get"` \| `"post"` \| `"put"` \| `"patch"` \| `"delete"` | Yes | HTTP method (Defender only supports `get`) |
| `queryParams` | object | No | Query parameters (`$filter`, `$select`, `$top`, `$skip`, etc.) |
| `body` | object | No | Request body for POST/PUT/PATCH |
| `fetchAll` | boolean | No | Set to `true` to follow pagination and return all results |
| `apiVersion` | string | No | Azure RM API version (required for `apiType: "azure"`) |
| `subscriptionId` | string | No | Azure subscription ID (for Azure RM) |
| `graphApiVersion` | `"v1.0"` \| `"beta"` | No | Graph API version (default: `beta`) |
| `consistencyLevel` | string | No | Set to `"eventual"` for Graph advanced queries (`$filter`, `$count`, `$search`) |

**Usage examples:**

```jsonc
// List all users (Graph)
{ "apiType": "graph", "path": "/users", "method": "get" }

// Get Azure VMs
{ "apiType": "azure", "path": "/subscriptions/{id}/providers/Microsoft.Compute/virtualMachines", "method": "get", "apiVersion": "2023-09-01" }

// List Defender machines (top 10)
{ "apiType": "defender", "path": "/api/machines", "method": "get", "queryParams": { "$top": "10" } }

// Get a specific Defender machine
{ "apiType": "defender", "path": "/api/machines/{deviceId}", "method": "get" }

// Filter Defender machines by risk score
{ "apiType": "defender", "path": "/api/machines", "method": "get", "queryParams": { "$filter": "riskScore eq 'High'" } }

// Fetch ALL Defender machines (follows pagination)
{ "apiType": "defender", "path": "/api/machines", "method": "get", "fetchAll": true }
```

### `set-access-token`

Set or update an access token for Microsoft Graph authentication when using client-provided token mode.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `accessToken` | string | Yes | The access token from Microsoft Graph authentication |
| `expiresOn` | string | No | Token expiration time in ISO format |

### `get-auth-status`

Check the current authentication status and mode of the MCP Server. Returns authentication mode, readiness status, and capabilities.

### `add-graph-permission`

Request additional Microsoft Graph permission scopes interactively.

## Environment Variables

| Name | Description | Required |
|------|-------------|----------|
| `TENANT_ID` | Microsoft Entra tenant ID | Yes (except client-provided token mode) |
| `CLIENT_ID` | Application (client) ID | Yes (except client-provided token mode) |
| `CLIENT_SECRET` | Client secret | For client credentials mode only |
| `USE_INTERACTIVE` | Set to `"true"` for interactive auth | No |
| `USE_CLIENT_TOKEN` | Set to `"true"` for client-provided token mode | No |
| `USE_CERTIFICATE` | Set to `"true"` for certificate auth | No |
| `CERTIFICATE_PATH` | Path to PEM certificate file | For certificate mode only |
| `CERTIFICATE_PASSWORD` | Certificate password (if encrypted) | No |
| `REDIRECT_URI` | Redirect URI for interactive auth (default: `http://localhost:3000`) | No |
| `ACCESS_TOKEN` | Initial access token for client-provided token mode | No |
| `USE_GRAPH_BETA` | Set to `"false"` to force Graph API v1.0 (default: `"true"`, allows beta) | No |

## Graph API Version Control

- **Default**: Uses `beta` version for access to latest features
- **Production mode**: Set `USE_GRAPH_BETA=false` to force all requests to use `v1.0`
- **Per-request override**: Specify `graphApiVersion` in individual requests (unless `USE_GRAPH_BETA=false`)

## Getting started

See the docs for more information on how to install and configure Lokka.

- [Introduction](https://lokka.dev/)
- [Install guide](https://lokka.dev/docs/install)
- [Developer guide](https://lokka.dev/docs/developer-guide)

### One-click install for VS Code

  | Platform | VS Code | VS Code Insiders |
  | - | - | - |
  | Windows | [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Lokka_for_Windows-0098FF?style=flat-square&logo=visualstudiocode&logoColor=ffffff)](vscode:mcp/install?%7B%22name%22%3A%22Lokka-Microsoft%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22cmd%22%2C%22args%22%3A%5B%22%2Fc%22%2C%22npx%22%2C%22-y%22%2C%22%40merill%2Flokka%22%5D%7D) | [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Lokka_for_Windows-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=ffffff)](vscode-insiders:mcp/install?%7B%22name%22%3A%22Lokka-Microsoft%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22cmd%22%2C%22args%22%3A%5B%22%2Fc%22%2C%22npx%22%2C%22-y%22%2C%22%40merill%2Flokka%22%5D%7D) |
  | macOS/Linux | [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Lokka_for_macOS_%26_Linux-0098FF?style=flat-square&logo=visualstudiocode&logoColor=ffffff)](vscode:mcp/install?%7B%22name%22%3A%22Lokka-Microsoft%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40merill%2Flokka%22%5D%7D) | [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Lokka_for_macOS_%26_Linux-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=ffffff)](vscode-insiders:mcp/install?%7B%22name%22%3A%22Lokka-Microsoft%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40merill%2Flokka%22%5D%7D) |

## Contributors

- Interactive and Token-based Authentication (v0.2.0) - [@darrenjrobinson](https://github.com/darrenjrobinson)
- Certificate Authentication (v0.2.1) - [@nitzpo](https://github.com/nitzpo)
