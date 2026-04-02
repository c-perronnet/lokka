#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Client, PageIterator } from "@microsoft/microsoft-graph-client";
import fetch from "isomorphic-fetch";
import { logger } from "./logger.js";
import { AuthManager, AuthMode } from "./auth.js";
import { LokkaClientId, LokkaDefaultTenantId, LokkaDefaultRedirectUri, getDefaultGraphApiVersion, DEFENDER_EU_BASE_URL, DEFENDER_SCOPE, DEFENDER_MAX_RETRIES, DEFENDER_BASE_DELAY_MS, DEFENDER_MAX_DELAY_MS } from "./constants.js";
global.fetch = fetch;
const server = new McpServer({
  name: "Lokka-Microsoft",
  version: "0.2.0"
  // Updated version for token-based auth support
});
logger.info("Starting Lokka Multi-Microsoft API MCP Server (v0.2.0 - Token-Based Auth Support)");
let authManager = null;
let graphClient = null;
const useGraphBeta = process.env.USE_GRAPH_BETA !== "false";
const defaultGraphApiVersion = getDefaultGraphApiVersion();
logger.info(`Graph API default version: ${defaultGraphApiVersion} (USE_GRAPH_BETA=${process.env.USE_GRAPH_BETA || "undefined"})`);
function formatDefenderError(status, errorBody) {
  let parsed;
  try {
    parsed = JSON.parse(errorBody);
  } catch {
    return `Defender API error (${status}): ${errorBody}`;
  }
  const message = parsed?.error?.message;
  if (status === 401) {
    return `Defender authentication failed (401 Unauthorized). Likely causes: expired token, or wrong token scope. Ensure the token uses scope 'https://api.securitycenter.microsoft.com/.default' (NOT 'https://api.security.microsoft.com/.default'). API message: ${message || errorBody}`;
  }
  if (status === 403) {
    return `Defender authorization failed (403 Forbidden). Likely causes: missing WindowsDefenderATP app permission (Machine.Read.All or Machine.ReadWrite.All), or admin consent not granted. Check: Azure Portal > App registrations > API permissions > WindowsDefenderATP. API message: ${message || errorBody}`;
  }
  return `Defender API error (${status}): ${message || errorBody}`;
}
server.tool(
  "Lokka-Microsoft",
  `A versatile tool to interact with Microsoft APIs including Microsoft Graph (Entra), Azure Resource Management, and Microsoft Defender for Endpoint (read-only device queries). For Defender: use apiType 'defender', path '/api/machines' to list devices, '/api/machines/{id}' for a specific device. Supports OData $filter on healthStatus, riskScore, exposureLevel, osPlatform, onboardingStatus, lastSeen, machineTags, lastIpAddress, computerDnsName. Filter examples: healthStatus eq 'Active', riskScore eq 'High', lastSeen gt 2024-01-01T00:00:00Z, startswith(computerDnsName,'prefix'), machineTags/any(tag: tag eq 'value'). Combine filters with 'and'/'or'. Use $top/$skip for pagination or fetchAll:true for all pages. Defender only supports GET requests. IMPORTANT: For Graph API GET requests using advanced query parameters ($filter, $count, $search, $orderby), you are ADVISED to set 'consistencyLevel: "eventual"'.`,
  {
    apiType: z.enum(["graph", "azure", "defender"]).describe(
      "Type of Microsoft API to query. Options: 'graph' for Microsoft Graph (Entra), 'azure' for Azure Resource Management, or 'defender' for Microsoft Defender for Endpoint (read-only device queries)."
    ),
    path: z.string().describe("The Azure or Graph API URL path to call (e.g. '/users', '/groups', '/subscriptions')"),
    method: z.enum(["get", "post", "put", "patch", "delete"]).describe("HTTP method to use"),
    apiVersion: z.string().optional().describe("Azure Resource Management API version (required for apiType Azure)"),
    subscriptionId: z.string().optional().describe("Azure Subscription ID (for Azure Resource Management)."),
    queryParams: z.record(z.string()).optional().describe("Query parameters for the request"),
    body: z.record(z.string(), z.any()).optional().describe("The request body (for POST, PUT, PATCH)"),
    graphApiVersion: z.enum(["v1.0", "beta"]).optional().default(defaultGraphApiVersion).describe(`Microsoft Graph API version to use (default: ${defaultGraphApiVersion})`),
    fetchAll: z.boolean().optional().default(false).describe("Set to true to automatically fetch all pages for list results (e.g., users, groups). Default is false."),
    consistencyLevel: z.string().optional().describe("Graph API ConsistencyLevel header. ADVISED to be set to 'eventual' for Graph GET requests using advanced query parameters ($filter, $count, $search, $orderby).")
  },
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
  }) => {
    const effectiveGraphApiVersion = !useGraphBeta ? "v1.0" : graphApiVersion;
    logger.info(`Executing Lokka-Microsoft tool with params: apiType=${apiType}, path=${path}, method=${method}, graphApiVersion=${effectiveGraphApiVersion}, fetchAll=${fetchAll}, consistencyLevel=${consistencyLevel}`);
    let determinedUrl;
    try {
      let responseData;
      if (apiType === "graph") {
        if (!graphClient) {
          throw new Error("Graph client not initialized");
        }
        determinedUrl = `https://graph.microsoft.com/${effectiveGraphApiVersion}`;
        let request = graphClient.api(path).version(effectiveGraphApiVersion);
        if (queryParams && Object.keys(queryParams).length > 0) {
          request = request.query(queryParams);
        }
        if (consistencyLevel) {
          request = request.header("ConsistencyLevel", consistencyLevel);
          logger.info(`Added ConsistencyLevel header: ${consistencyLevel}`);
        }
        switch (method.toLowerCase()) {
          case "get":
            if (fetchAll) {
              logger.info(`Fetching all pages for Graph path: ${path}`);
              const firstPageResponse = await request.get();
              const odataContext = firstPageResponse["@odata.context"];
              let allItems = firstPageResponse.value || [];
              const callback = (item) => {
                allItems.push(item);
                return true;
              };
              const pageIterator = new PageIterator(graphClient, firstPageResponse, callback);
              await pageIterator.iterate();
              responseData = {
                "@odata.context": odataContext,
                value: allItems
              };
              logger.info(`Finished fetching all Graph pages. Total items: ${allItems.length}`);
            } else {
              logger.info(`Fetching single page for Graph path: ${path}`);
              responseData = await request.get();
            }
            break;
          case "post":
            responseData = await request.post(body ?? {});
            break;
          case "put":
            responseData = await request.put(body ?? {});
            break;
          case "patch":
            responseData = await request.patch(body ?? {});
            break;
          case "delete":
            responseData = await request.delete();
            if (responseData === void 0 || responseData === null) {
              responseData = { status: "Success (No Content)" };
            }
            break;
          default:
            throw new Error(`Unsupported method: ${method}`);
        }
      } else if (apiType === "azure") {
        if (!authManager) {
          throw new Error("Auth manager not initialized");
        }
        determinedUrl = "https://management.azure.com";
        const azureCredential = authManager.getAzureCredential();
        const tokenResponse = await azureCredential.getToken("https://management.azure.com/.default");
        if (!tokenResponse || !tokenResponse.token) {
          throw new Error("Failed to acquire Azure access token");
        }
        let url = determinedUrl;
        if (subscriptionId) {
          url += `/subscriptions/${subscriptionId}`;
        }
        url += path;
        if (!apiVersion) {
          throw new Error("API version is required for Azure Resource Management queries");
        }
        const urlParams = new URLSearchParams({ "api-version": apiVersion });
        if (queryParams) {
          for (const [key, value] of Object.entries(queryParams)) {
            urlParams.append(String(key), String(value));
          }
        }
        url += `?${urlParams.toString()}`;
        const headers = {
          "Authorization": `Bearer ${tokenResponse.token}`,
          "Content-Type": "application/json"
        };
        const requestOptions = {
          method: method.toUpperCase(),
          headers
        };
        if (["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
          requestOptions.body = body ? JSON.stringify(body) : JSON.stringify({});
        }
        if (fetchAll && method === "get") {
          logger.info(`Fetching all pages for Azure RM starting from: ${url}`);
          let allValues = [];
          let currentUrl = url;
          while (currentUrl) {
            logger.info(`Fetching Azure RM page: ${currentUrl}`);
            const azureCredential2 = authManager.getAzureCredential();
            const currentPageTokenResponse = await azureCredential2.getToken("https://management.azure.com/.default");
            if (!currentPageTokenResponse || !currentPageTokenResponse.token) {
              throw new Error("Failed to acquire Azure access token during pagination");
            }
            const currentPageHeaders = { ...headers, "Authorization": `Bearer ${currentPageTokenResponse.token}` };
            const currentPageRequestOptions = { method: "GET", headers: currentPageHeaders };
            const pageResponse = await fetch(currentUrl, currentPageRequestOptions);
            const pageText = await pageResponse.text();
            let pageData;
            try {
              pageData = pageText ? JSON.parse(pageText) : {};
            } catch (e) {
              logger.error(`Failed to parse JSON from Azure RM page: ${currentUrl}`, pageText);
              pageData = { rawResponse: pageText };
            }
            if (!pageResponse.ok) {
              logger.error(`API error on Azure RM page ${currentUrl}:`, pageData);
              throw new Error(`API error (${pageResponse.status}) during Azure RM pagination on ${currentUrl}: ${JSON.stringify(pageData)}`);
            }
            if (pageData.value && Array.isArray(pageData.value)) {
              allValues = allValues.concat(pageData.value);
            } else if (currentUrl === url && !pageData.nextLink) {
              allValues.push(pageData);
            } else if (currentUrl !== url) {
              logger.info(`[Warning] Azure RM response from ${currentUrl} did not contain a 'value' array.`);
            }
            currentUrl = pageData.nextLink || null;
          }
          responseData = { allValues };
          logger.info(`Finished fetching all Azure RM pages. Total items: ${allValues.length}`);
        } else {
          logger.info(`Fetching single page for Azure RM: ${url}`);
          const apiResponse = await fetch(url, requestOptions);
          const responseText = await apiResponse.text();
          try {
            responseData = responseText ? JSON.parse(responseText) : {};
          } catch (e) {
            logger.error(`Failed to parse JSON from single Azure RM page: ${url}`, responseText);
            responseData = { rawResponse: responseText };
          }
          if (!apiResponse.ok) {
            logger.error(`API error for Azure RM ${method} ${path}:`, responseData);
            throw new Error(`API error (${apiResponse.status}) for Azure RM: ${JSON.stringify(responseData)}`);
          }
        }
      } else if (apiType === "defender") {
        if (method !== "get") {
          throw new Error(
            `Defender for Endpoint integration is read-only. Only GET requests are supported. Received method: ${method.toUpperCase()}`
          );
        }
        if (!authManager) {
          throw new Error("Auth manager not initialized");
        }
        const azureCredential = authManager.getAzureCredential();
        const tokenResponse = await azureCredential.getToken(DEFENDER_SCOPE);
        if (!tokenResponse?.token) {
          throw new Error(
            "Failed to acquire Defender access token. Verify: (1) App registration has WindowsDefenderATP > Machine.Read.All or Machine.ReadWrite.All permission, (2) Admin consent is granted, (3) Token scope is 'https://api.securitycenter.microsoft.com/.default'. Note: The scope hostname differs from the API hostname."
          );
        }
        determinedUrl = DEFENDER_EU_BASE_URL;
        let url = `${DEFENDER_EU_BASE_URL}${path}`;
        if (queryParams && Object.keys(queryParams).length > 0) {
          const urlParams = new URLSearchParams(queryParams);
          url += `?${urlParams.toString()}`;
        }
        const defenderHeaders = {
          "Authorization": `Bearer ${tokenResponse.token}`,
          "Content-Type": "application/json"
        };
        if (fetchAll) {
          logger.info(`Fetching all Defender pages starting from: ${url}`);
          let allValues = [];
          let currentUrl = url;
          let retryCount = 0;
          while (currentUrl) {
            logger.info(`Fetching Defender page: ${currentUrl}`);
            const pageCredential = authManager.getAzureCredential();
            const pageToken = await pageCredential.getToken(DEFENDER_SCOPE);
            if (!pageToken?.token) {
              throw new Error("Token acquisition failed during Defender pagination");
            }
            const pageResponse = await fetch(currentUrl, {
              method: "GET",
              headers: {
                ...defenderHeaders,
                "Authorization": `Bearer ${pageToken.token}`
              }
            });
            if (pageResponse.status === 429) {
              if (retryCount >= DEFENDER_MAX_RETRIES) {
                throw new Error(
                  `Defender API rate limit exceeded after ${DEFENDER_MAX_RETRIES} retries on ${currentUrl}. Try reducing the result set with $filter or $top.`
                );
              }
              const retryAfter = pageResponse.headers.get("Retry-After");
              const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1e3 : Math.min(DEFENDER_BASE_DELAY_MS * Math.pow(2, retryCount), DEFENDER_MAX_DELAY_MS);
              logger.info(`Rate limited (429). Retry ${retryCount + 1}/${DEFENDER_MAX_RETRIES} after ${delayMs}ms`);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              retryCount++;
              continue;
            }
            if (!pageResponse.ok) {
              const errorBody = await pageResponse.text();
              throw new Error(formatDefenderError(pageResponse.status, errorBody));
            }
            retryCount = 0;
            const pageData = await pageResponse.json();
            if (pageData.value && Array.isArray(pageData.value)) {
              allValues = allValues.concat(pageData.value);
            }
            currentUrl = pageData["@odata.nextLink"] || null;
            if (currentUrl) {
              try {
                const nextUrl = new URL(currentUrl);
                const euHost = new URL(DEFENDER_EU_BASE_URL).hostname;
                if (nextUrl.hostname !== euHost) {
                  logger.info(`Rewriting nextLink hostname: ${nextUrl.hostname} -> ${euHost}`);
                  nextUrl.hostname = euHost;
                  currentUrl = nextUrl.toString();
                }
              } catch (e) {
                logger.info(`Warning: Could not parse nextLink URL, following as-is: ${currentUrl}`);
              }
            }
          }
          responseData = { value: allValues };
          logger.info(`Finished fetching all Defender pages. Total items: ${allValues.length}`);
        } else {
          logger.info(`Fetching single Defender page: ${url}`);
          const apiResponse = await fetch(url, {
            method: "GET",
            headers: defenderHeaders
          });
          const responseText = await apiResponse.text();
          try {
            responseData = responseText ? JSON.parse(responseText) : {};
          } catch (e) {
            logger.error(`Failed to parse JSON from Defender response: ${url}`, responseText);
            responseData = { rawResponse: responseText };
          }
          if (!apiResponse.ok) {
            logger.error(`Defender API error for GET ${path}:`, responseData);
            throw new Error(formatDefenderError(apiResponse.status, JSON.stringify(responseData)));
          }
        }
      }
      let resultText = `Result for ${apiType} API (${apiType === "graph" ? effectiveGraphApiVersion : apiVersion}) - ${method} ${path}:

`;
      resultText += JSON.stringify(responseData, null, 2);
      if (!fetchAll && method === "get") {
        const nextLinkKey = apiType === "azure" ? "nextLink" : "@odata.nextLink";
        if (responseData && responseData[nextLinkKey]) {
          resultText += `

Note: More results are available. To retrieve all pages, add the parameter 'fetchAll: true' to your request.`;
        }
      }
      return {
        content: [{ type: "text", text: resultText }]
      };
    } catch (error) {
      logger.error(`Error in Lokka-Microsoft tool (apiType: ${apiType}, path: ${path}, method: ${method}):`, error);
      if (!determinedUrl) {
        determinedUrl = apiType === "graph" ? `https://graph.microsoft.com/${effectiveGraphApiVersion}` : apiType === "defender" ? DEFENDER_EU_BASE_URL : "https://management.azure.com";
      }
      const errorBody = error.body ? typeof error.body === "string" ? error.body : JSON.stringify(error.body) : "N/A";
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            statusCode: error.statusCode || "N/A",
            // Include status code if available from SDK error
            errorBody,
            attemptedBaseUrl: determinedUrl
          })
        }],
        isError: true
      };
    }
  }
);
server.tool(
  "set-access-token",
  "Set or update the access token for Microsoft Graph authentication. Use this when the MCP Client has obtained a fresh token through interactive authentication.",
  {
    accessToken: z.string().describe("The access token obtained from Microsoft Graph authentication"),
    expiresOn: z.string().optional().describe("Token expiration time in ISO format (optional, defaults to 1 hour from now)")
  },
  async ({ accessToken, expiresOn }) => {
    try {
      const expirationDate = expiresOn ? new Date(expiresOn) : void 0;
      if (authManager?.getAuthMode() === AuthMode.ClientProvidedToken) {
        authManager.updateAccessToken(accessToken, expirationDate);
        const authProvider = authManager.getGraphAuthProvider();
        graphClient = Client.initWithMiddleware({
          authProvider
        });
        return {
          content: [{
            type: "text",
            text: "Access token updated successfully. You can now make Microsoft Graph requests on behalf of the authenticated user."
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: "Error: MCP Server is not configured for client-provided token authentication. Set USE_CLIENT_TOKEN=true in environment variables."
          }],
          isError: true
        };
      }
    } catch (error) {
      logger.error("Error setting access token:", error);
      return {
        content: [{
          type: "text",
          text: `Error setting access token: ${error.message}`
        }],
        isError: true
      };
    }
  }
);
server.tool(
  "get-auth-status",
  "Check the current authentication status and mode of the MCP Server and also returns the current graph permission scopes of the access token for the current session.",
  {},
  async () => {
    try {
      const authMode = authManager?.getAuthMode() || "Not initialized";
      const isReady = authManager !== null;
      const tokenStatus = authManager ? await authManager.getTokenStatus() : { isExpired: false };
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            authMode,
            isReady,
            supportsTokenUpdates: authMode === AuthMode.ClientProvidedToken,
            tokenStatus,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error checking auth status: ${error.message}`
        }],
        isError: true
      };
    }
  }
);
server.tool(
  "add-graph-permission",
  "Request additional Microsoft Graph permission scopes by performing a fresh interactive sign-in. This tool only works in interactive authentication mode and should be used if any Graph API call returns permissions related errors.",
  {
    scopes: z.array(z.string()).describe("Array of Microsoft Graph permission scopes to request (e.g., ['User.Read', 'Mail.ReadWrite', 'Directory.Read.All'])")
  },
  async ({ scopes }) => {
    try {
      if (!authManager || authManager.getAuthMode() !== AuthMode.Interactive) {
        const currentMode = authManager?.getAuthMode() || "Not initialized";
        const clientId2 = process.env.CLIENT_ID;
        let errorMessage = `Error: add-graph-permission tool is only available in interactive authentication mode. Current mode: ${currentMode}.

`;
        if (currentMode === AuthMode.ClientCredentials) {
          errorMessage += `\u{1F4CB} To add permissions in Client Credentials mode:
`;
          errorMessage += `1. Open the Microsoft Entra admin center (https://entra.microsoft.com)
`;
          errorMessage += `2. Navigate to Applications > App registrations
`;
          errorMessage += `3. Find your application${clientId2 ? ` (Client ID: ${clientId2})` : ""}
`;
          errorMessage += `4. Go to API permissions
`;
          errorMessage += `5. Click "Add a permission" and select Microsoft Graph
`;
          errorMessage += `6. Choose "Application permissions" and add the required scopes:
`;
          errorMessage += `   ${scopes.map((scope) => `\u2022 ${scope}`).join("\n   ")}
`;
          errorMessage += `7. Click "Grant admin consent" to approve the permissions
`;
          errorMessage += `8. Restart the MCP server to use the new permissions`;
        } else if (currentMode === AuthMode.ClientProvidedToken) {
          errorMessage += `\u{1F4CB} To add permissions in Client Provided Token mode:
`;
          errorMessage += `1. Obtain a new access token that includes the required scopes:
`;
          errorMessage += `   ${scopes.map((scope) => `\u2022 ${scope}`).join("\n   ")}
`;
          errorMessage += `2. When obtaining the token, ensure these scopes are included in the consent prompt
`;
          errorMessage += `3. Use the set-access-token tool to update the server with the new token
`;
          errorMessage += `4. The new token will include the additional permissions`;
        } else {
          errorMessage += `To use interactive permission requests, set USE_INTERACTIVE=true in environment variables and restart the server.`;
        }
        return {
          content: [{
            type: "text",
            text: errorMessage
          }],
          isError: true
        };
      }
      if (!scopes || scopes.length === 0) {
        return {
          content: [{
            type: "text",
            text: "Error: At least one permission scope must be specified."
          }],
          isError: true
        };
      }
      const invalidScopes = scopes.filter((scope) => !scope.includes(".") || scope.trim() !== scope);
      if (invalidScopes.length > 0) {
        return {
          content: [{
            type: "text",
            text: `Error: Invalid scope format detected: ${invalidScopes.join(", ")}. Scopes should be in format like 'User.Read' or 'Mail.ReadWrite'.`
          }],
          isError: true
        };
      }
      logger.info(`Requesting additional Graph permissions: ${scopes.join(", ")}`);
      const tenantId = process.env.TENANT_ID || LokkaDefaultTenantId;
      const clientId = process.env.CLIENT_ID || LokkaClientId;
      const redirectUri = process.env.REDIRECT_URI || LokkaDefaultRedirectUri;
      logger.info(`Using tenant ID: ${tenantId}, client ID: ${clientId} for interactive authentication`);
      const { InteractiveBrowserCredential, DeviceCodeCredential } = await import("@azure/identity");
      authManager = null;
      graphClient = null;
      const scopeString = scopes.map((scope) => `https://graph.microsoft.com/${scope}`).join(" ");
      logger.info(`Requesting fresh token with scopes: ${scopeString}`);
      console.log(`
\u{1F510} Requesting Additional Graph Permissions:`);
      console.log(`Scopes: ${scopes.join(", ")}`);
      console.log(`You will be prompted to sign in to grant these permissions.
`);
      let newCredential;
      let tokenResponse;
      try {
        newCredential = new InteractiveBrowserCredential({
          tenantId,
          clientId,
          redirectUri
        });
        tokenResponse = await newCredential.getToken(scopeString);
      } catch (error) {
        logger.info("Interactive browser failed, falling back to device code flow");
        newCredential = new DeviceCodeCredential({
          tenantId,
          clientId,
          userPromptCallback: (info) => {
            console.log(`
\u{1F510} Additional Permissions Required:`);
            console.log(`Please visit: ${info.verificationUri}`);
            console.log(`And enter code: ${info.userCode}`);
            console.log(`Requested scopes: ${scopes.join(", ")}
`);
            return Promise.resolve();
          }
        });
        tokenResponse = await newCredential.getToken(scopeString);
      }
      if (!tokenResponse) {
        return {
          content: [{
            type: "text",
            text: "Error: Failed to acquire access token with the requested scopes. Please check your permissions and try again."
          }],
          isError: true
        };
      }
      const authConfig = {
        mode: AuthMode.Interactive,
        tenantId,
        clientId,
        redirectUri
      };
      authManager = new AuthManager(authConfig);
      authManager.credential = newCredential;
      const authProvider = authManager.getGraphAuthProvider();
      graphClient = Client.initWithMiddleware({
        authProvider
      });
      const tokenStatus = await authManager.getTokenStatus();
      logger.info(`Successfully acquired fresh token with additional scopes: ${scopes.join(", ")}`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            message: "Successfully acquired additional Microsoft Graph permissions with fresh authentication",
            requestedScopes: scopes,
            tokenStatus,
            note: "A fresh sign-in was performed to ensure the new permissions are properly granted",
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.error("Error requesting additional Graph permissions:", error);
      return {
        content: [{
          type: "text",
          text: `Error requesting additional permissions: ${error.message}`
        }],
        isError: true
      };
    }
  }
);
async function main() {
  const useCertificate = process.env.USE_CERTIFICATE === "true";
  const useInteractive = process.env.USE_INTERACTIVE === "true";
  const useClientToken = process.env.USE_CLIENT_TOKEN === "true";
  const initialAccessToken = process.env.ACCESS_TOKEN;
  let authMode;
  const enabledModes = [
    useClientToken,
    useInteractive,
    useCertificate
  ].filter(Boolean);
  if (enabledModes.length > 1) {
    throw new Error(
      "Multiple authentication modes enabled. Please enable only one of USE_CLIENT_TOKEN, USE_INTERACTIVE, or USE_CERTIFICATE."
    );
  }
  if (useClientToken) {
    authMode = AuthMode.ClientProvidedToken;
    if (!initialAccessToken) {
      logger.info("Client token mode enabled but no initial token provided. Token must be set via set-access-token tool.");
    }
  } else if (useInteractive) {
    authMode = AuthMode.Interactive;
  } else if (useCertificate) {
    authMode = AuthMode.Certificate;
  } else {
    const hasClientCredentials = process.env.TENANT_ID && process.env.CLIENT_ID && process.env.CLIENT_SECRET;
    if (hasClientCredentials) {
      authMode = AuthMode.ClientCredentials;
    } else {
      authMode = AuthMode.Interactive;
      logger.info("No authentication mode specified and no client credentials found. Defaulting to interactive mode.");
    }
  }
  logger.info(`Starting with authentication mode: ${authMode}`);
  let tenantId;
  let clientId;
  if (authMode === AuthMode.Interactive) {
    tenantId = process.env.TENANT_ID || LokkaDefaultTenantId;
    clientId = process.env.CLIENT_ID || LokkaClientId;
    logger.info(`Interactive mode using tenant ID: ${tenantId}, client ID: ${clientId}`);
  } else {
    tenantId = process.env.TENANT_ID;
    clientId = process.env.CLIENT_ID;
  }
  const clientSecret = process.env.CLIENT_SECRET;
  const certificatePath = process.env.CERTIFICATE_PATH;
  const certificatePassword = process.env.CERTIFICATE_PASSWORD;
  if (authMode === AuthMode.ClientCredentials) {
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error("Client credentials mode requires explicit TENANT_ID, CLIENT_ID, and CLIENT_SECRET environment variables");
    }
  } else if (authMode === AuthMode.Certificate) {
    if (!tenantId || !clientId || !certificatePath) {
      throw new Error("Certificate mode requires explicit TENANT_ID, CLIENT_ID, and CERTIFICATE_PATH environment variables");
    }
  }
  const authConfig = {
    mode: authMode,
    tenantId,
    clientId,
    clientSecret,
    accessToken: initialAccessToken,
    redirectUri: process.env.REDIRECT_URI,
    certificatePath,
    certificatePassword
  };
  authManager = new AuthManager(authConfig);
  if (authMode !== AuthMode.ClientProvidedToken || initialAccessToken) {
    await authManager.initialize();
    const authProvider = authManager.getGraphAuthProvider();
    graphClient = Client.initWithMiddleware({
      authProvider
    });
    logger.info(`Authentication initialized successfully using ${authMode} mode`);
  } else {
    logger.info("Started in client token mode. Use set-access-token tool to provide authentication token.");
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((error) => {
  console.error("Fatal error in main():", error);
  logger.error("Fatal error in main()", error);
  process.exit(1);
});
