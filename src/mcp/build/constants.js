const LokkaClientId = "a9bac4c3-af0d-4292-9453-9da89e390140";
const LokkaDefaultTenantId = "common";
const LokkaDefaultRedirectUri = "http://localhost:3000";
const getDefaultGraphApiVersion = () => {
  return process.env.USE_GRAPH_BETA !== "false" ? "beta" : "v1.0";
};
const DEFENDER_EU_BASE_URL = "https://eu.api.security.microsoft.com";
const DEFENDER_SCOPE = "https://api.securitycenter.microsoft.com/.default";
export {
  DEFENDER_EU_BASE_URL,
  DEFENDER_SCOPE,
  LokkaClientId,
  LokkaDefaultRedirectUri,
  LokkaDefaultTenantId,
  getDefaultGraphApiVersion
};
