// Setup: ln -sf ../src/mcp/node_modules scripts/node_modules  (one-time, from project root)
// Run:   cd src/mcp && npx tsc --project ../../scripts/tsconfig.json && node ../../scripts/build/verify-defender-auth.js
// Requires: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET environment variables

import { ClientSecretCredential } from "@azure/identity";
import jwt from "jsonwebtoken";

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFENDER_SCOPE = "https://api.securitycenter.microsoft.com/.default";
const EXPECTED_AUD = "https://api.securitycenter.microsoft.com";
const EU_MACHINES_URL = "https://eu.api.security.microsoft.com/api/machines?$top=1";

// ── Helpers ────────────────────────────────────────────────────────────────────

function pass(step: string, detail: string): void {
  console.log(`[PASS] Step ${step}: ${detail}`);
}

function fail(step: string, detail: string): void {
  console.error(`[FAIL] Step ${step}: ${detail}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    console.error(
      "Missing required environment variables: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET"
    );
    process.exit(1);
  }

  let allPassed = true;

  // ── Step 1: Token acquisition ──────────────────────────────────────────────

  console.log("\n--- Step 1: Token Acquisition ---");
  let tokenString: string;

  try {
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const tokenResponse = await credential.getToken(DEFENDER_SCOPE);

    if (!tokenResponse || !tokenResponse.token) {
      fail("1", "Token response is null or missing token field");
      process.exit(1);
    }

    tokenString = tokenResponse.token;
    pass("1", "Token acquired successfully");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("1", `Token acquisition failed: ${message}`);
    process.exit(1);
  }

  // ── Step 2: JWT claims verification ────────────────────────────────────────

  console.log("\n--- Step 2: JWT Claims Verification ---");

  const decoded = jwt.decode(tokenString) as Record<string, unknown> | null;

  if (!decoded || typeof decoded !== "object") {
    fail("2", "Could not decode JWT token");
    allPassed = false;
  } else {
    const aud = decoded.aud as string | undefined;
    const roles = decoded.roles as string[] | undefined;

    console.log(`  aud:   ${aud ?? "(missing)"}`);
    console.log(`  roles: ${roles ? JSON.stringify(roles) : "(missing)"}`);

    // Check audience
    if (aud === EXPECTED_AUD) {
      pass("2a", `aud matches expected value (${EXPECTED_AUD})`);
    } else {
      fail("2a", `aud is "${aud}", expected "${EXPECTED_AUD}"`);
      allPassed = false;
    }

    // Check roles
    const hasRead = roles?.includes("Machine.Read.All") ?? false;
    const hasReadWrite = roles?.includes("Machine.ReadWrite.All") ?? false;

    if (hasRead) {
      pass("2b", "roles includes Machine.Read.All");
    } else if (hasReadWrite) {
      pass(
        "2b",
        "roles includes Machine.ReadWrite.All (Machine.Read.All not available as separate permission)"
      );
      console.log(
        "  Note: Using Machine.ReadWrite.All (Machine.Read.All not available as separate permission)"
      );
    } else {
      fail(
        "2b",
        "roles does not include Machine.Read.All or Machine.ReadWrite.All. " +
          "Ensure admin consent has been granted for the WindowsDefenderATP API permission."
      );
      allPassed = false;
    }
  }

  // ── Step 3: EU endpoint API call ───────────────────────────────────────────

  console.log("\n--- Step 3: EU Endpoint API Call ---");

  try {
    const response = await fetch(EU_MACHINES_URL, {
      headers: {
        Authorization: `Bearer ${tokenString}`,
      },
    });

    console.log(`  HTTP status: ${response.status}`);

    if (response.ok) {
      pass("3", "EU endpoint reachable (HTTP 200)");
      const body = await response.text();
      const preview = body.length > 500 ? body.substring(0, 500) + "... (truncated)" : body;
      console.log(`  Response preview:\n${preview}`);
    } else {
      fail("3", `EU endpoint returned HTTP ${response.status}`);
      const body = await response.text();
      console.error(`  Response body:\n${body}`);
      allPassed = false;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("3", `EU endpoint request failed: ${message}`);
    allPassed = false;
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log("\n--- Summary ---");
  if (allPassed) {
    console.log("All checks PASSED. Defender auth prerequisites are confirmed.");
    process.exit(0);
  } else {
    console.log("One or more checks FAILED. Review output above.");
    process.exit(1);
  }
}

main();
