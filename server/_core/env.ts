export const ENV = {
  appId: process.env.VITE_APP_ID ?? "graceful-fail",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // GitHub OAuth
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // ThreatShield — free threat intelligence APIs (all optional)
  abuseipdbApiKey: process.env.ABUSEIPDB_API_KEY ?? "",
  googleSafeBrowsingKey: process.env.GOOGLE_SAFEBROWSING_API_KEY ?? "",
  ipgeolocationApiKey: process.env.IPGEOLOCATION_API_KEY ?? "",
  // x402 Payment Protocol
  x402ReceivingWallet: process.env.X402_RECEIVING_WALLET ?? "",
  x402FacilitatorUrl: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
  x402Networks: process.env.X402_NETWORKS ?? "base,base-sepolia",
  x402Testnet: process.env.X402_TESTNET === "true",
};
