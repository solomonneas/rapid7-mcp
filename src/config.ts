/**
 * Configuration for the Rapid7 InsightIDR MCP server.
 *
 * Required environment variables:
 *   - RAPID7_API_KEY: Your InsightIDR API key
 *   - RAPID7_REGION: Your InsightIDR region code (e.g., us, us2, us3, eu, ca, au, ap)
 *
 * Optional:
 *   - RAPID7_BASE_URL: Override the full API base URL
 *   - RAPID7_TIMEOUT: Request timeout in seconds (default: 30)
 */

export interface Rapid7Config {
  /** Base URL for the InsightIDR REST API */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Region code */
  region: string;
  /** Request timeout in milliseconds */
  timeout: number;
}

/** Map of region codes to API base URLs */
const REGION_URLS: Record<string, string> = {
  us: "https://us.api.insight.rapid7.com",
  us2: "https://us2.api.insight.rapid7.com",
  us3: "https://us3.api.insight.rapid7.com",
  eu: "https://eu.api.insight.rapid7.com",
  ca: "https://ca.api.insight.rapid7.com",
  au: "https://au.api.insight.rapid7.com",
  ap: "https://ap.api.insight.rapid7.com",
};

/**
 * Load and validate configuration from environment variables.
 * @throws {Error} if required variables are missing
 */
export function getConfig(): Rapid7Config {
  const apiKey = process.env.RAPID7_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RAPID7_API_KEY environment variable is required. " +
        "Generate an API key from InsightIDR > Settings > API Keys."
    );
  }

  const region = (process.env.RAPID7_REGION || "us").toLowerCase();

  let baseUrl = process.env.RAPID7_BASE_URL;
  if (!baseUrl) {
    baseUrl = REGION_URLS[region];
    if (!baseUrl) {
      throw new Error(
        `Unknown RAPID7_REGION '${region}'. ` +
          `Valid regions: ${Object.keys(REGION_URLS).join(", ")}. ` +
          `Or set RAPID7_BASE_URL directly.`
      );
    }
  }

  const timeout =
    parseInt(process.env.RAPID7_TIMEOUT ?? "30", 10) * 1000;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    region,
    timeout,
  };
}
