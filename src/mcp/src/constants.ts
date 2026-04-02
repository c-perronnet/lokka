// Shared constants for the Lokka MCP Server

export const LokkaClientId = "a9bac4c3-af0d-4292-9453-9da89e390140";
export const LokkaDefaultTenantId = "common";
export const LokkaDefaultRedirectUri = "http://localhost:3000";

// Default Graph API version based on USE_GRAPH_BETA environment variable
export const getDefaultGraphApiVersion = (): "v1.0" | "beta" => {
  return process.env.USE_GRAPH_BETA !== 'false' ? "beta" : "v1.0";
};

// Microsoft Defender for Endpoint constants
export const DEFENDER_EU_BASE_URL = "https://eu.api.security.microsoft.com";
export const DEFENDER_SCOPE = "https://api.securitycenter.microsoft.com/.default";
export const DEFENDER_MAX_RETRIES = 5;
export const DEFENDER_BASE_DELAY_MS = 10_000; // 10 seconds
export const DEFENDER_MAX_DELAY_MS = 120_000; // 2 minutes cap
