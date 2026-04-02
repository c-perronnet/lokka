const LokkaClientId = "a9bac4c3-af0d-4292-9453-9da89e390140";
const LokkaDefaultTenantId = "common";
const LokkaDefaultRedirectUri = "http://localhost:3000";
const getDefaultGraphApiVersion = () => {
  return process.env.USE_GRAPH_BETA !== "false" ? "beta" : "v1.0";
};
const DEFENDER_EU_BASE_URL = "https://eu.api.security.microsoft.com";
const DEFENDER_SCOPE = "https://api.securitycenter.microsoft.com/.default";
const DEFENDER_MAX_RETRIES = 5;
const DEFENDER_BASE_DELAY_MS = 1e4;
const DEFENDER_MAX_DELAY_MS = 12e4;
export {
  DEFENDER_BASE_DELAY_MS,
  DEFENDER_EU_BASE_URL,
  DEFENDER_MAX_DELAY_MS,
  DEFENDER_MAX_RETRIES,
  DEFENDER_SCOPE,
  LokkaClientId,
  LokkaDefaultRedirectUri,
  LokkaDefaultTenantId,
  getDefaultGraphApiVersion
};
