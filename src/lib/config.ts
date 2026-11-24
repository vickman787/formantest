/** Public chain + pricing config. Secrets never live here. */
export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
export const QIE_CHAIN_ID = Number(process.env.QIE_CHAIN_ID ?? 1990);
export const QIE_RPC_URL = process.env.QIE_RPC_URL ?? "https://rpc1mainnet.qie.digital";
export const QIE_EXPLORER_URL = process.env.QIE_EXPLORER_URL ?? "https://mainnet.qie.digital";
export const QUSDC_ADDRESS = (process.env.QUSDC_ADDRESS ??
  "0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5") as `0x${string}`;
export const QUSDC_DECIMALS = Number(process.env.QUSDC_DECIMALS ?? 6);
/** 1 QUSDC in base units (6 decimals). Stored as an integer string, never float. */
export const SERVICE_PRICE_BASE_UNITS = process.env.SERVICE_PRICE_BASE_UNITS ?? "1000000";
export const SERVICE_PRICE_LABEL = "1 QUSDC · approximately $1 · launch price";
export const ESCROW_ADDRESS = (process.env.ESCROW_ADDRESS ?? "") as `0x${string}` | "";
export const TREASURY_ADDRESS = (process.env.TREASURY_ADDRESS ?? "") as `0x${string}` | "";
export const ADMIN_WALLETS = (process.env.ADMIN_WALLETS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
export const MAX_JOB_COST_USD = Number(process.env.MAX_JOB_COST_USD ?? 0.5);
export const MAX_PROVIDER_RETRIES = Number(process.env.MAX_PROVIDER_RETRIES ?? 2);
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
export const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "";
export const OPENAI_RESEARCH_MODEL = process.env.OPENAI_RESEARCH_MODEL ?? "";

/** The app is live-only: real escrow, real money, real research. It is
 *  only ready when the escrow is deployed and configured. */
export function liveReady(): boolean {
  return ESCROW_ADDRESS !== "" && TREASURY_ADDRESS !== "";
}
