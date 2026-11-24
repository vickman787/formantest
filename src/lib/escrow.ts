import { createPublicClient, http, keccak256, parseAbiItem, toHex } from "viem";
import { ESCROW_ADDRESS, QIE_CHAIN_ID, QIE_RPC_URL, QUSDC_ADDRESS, SERVICE_PRICE_BASE_UNITS } from "./config";

/** Minimal ServiceEscrow interface (see contracts/src/ServiceEscrow.sol).
 *  The escrow is the only contract the app talks to. QUSDC asset and the
 *  settlement treasury are immutable in the contract. */

export const ESCROW_ABI = [
  parseAbiItem("event JobFunded(bytes32 indexed jobId, address indexed customer, uint256 amount)"),
  parseAbiItem("event DeliverySubmitted(bytes32 indexed jobId, bytes32 manifestHash)"),
  parseAbiItem("event DeliveryAccepted(bytes32 indexed jobId, address indexed customer, uint256 amount)"),
  parseAbiItem("event JobRefunded(bytes32 indexed jobId, address indexed customer, uint256 amount)"),
  parseAbiItem("function getJob(bytes32 jobId) view returns (address customer, uint256 amount, uint8 status, bytes32 manifestHash, uint64 fundDeadline, uint64 deliveryDeadline, uint64 reviewDeadline)"),
] as const;

export const QUSDC_ABI = [
  parseAbiItem("function approve(address spender, uint256 amount) returns (bool)"),
  parseAbiItem("function allowance(address owner, address spender) view returns (uint256)"),
  parseAbiItem("function balanceOf(address account) view returns (uint256)"),
  parseAbiItem("function decimals() view returns (uint8)"),
] as const;

export const ESCROW_WRITE_ABI = [
  parseAbiItem("function createJob(bytes32 jobId, address customer, uint256 amount, uint64 fundDeadline, uint64 deliveryDeadline, uint64 reviewDeadline)"),
  parseAbiItem("function fundJob(bytes32 jobId)"),
  parseAbiItem("function acceptDelivery(bytes32 jobId)"),
  parseAbiItem("function submitDelivery(bytes32 jobId, bytes32 manifestHash)"),
] as const;

/** Deterministic onchain job id for an order id. */
export function jobIdFor(orderId: string): `0x${string}` {
  return keccak256(toHex(orderId));
}

export const qieChain = {
  id: QIE_CHAIN_ID,
  name: "QIE Mainnet",
  nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
  rpcUrls: { default: { http: [QIE_RPC_URL] } },
  blockExplorers: { default: { name: "QIE Explorer", url: "https://mainnet.qie.digital" } },
} as const;

export function publicClient() {
  return createPublicClient({ chain: qieChain, transport: http(QIE_RPC_URL) });
}

export function escrowDeployed(): boolean {
  return ESCROW_ADDRESS !== "";
}

/** Verify a funding receipt onchain: receipt status, contract address,
 *  JobFunded event, customer, job id and the exact 1 QUSDC amount.
 *  A transaction hash alone is never proof. */
export async function verifyFunding(txHash: `0x${string}`, jobId: `0x${string}`, customer: `0x${string}`): Promise<{ ok: boolean; reason?: string }> {
  if (!escrowDeployed()) return { ok: false, reason: "Escrow is not deployed yet." };
  const client = publicClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) return { ok: false, reason: "Transaction not found yet. Wait for confirmation and retry." };
  if (receipt.status !== "success") return { ok: false, reason: "Transaction failed onchain." };
  if (receipt.to?.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) {
    return { ok: false, reason: "Transaction was not sent to the Forma escrow contract." };
  }
  const logs = await client.getLogs({
    address: ESCROW_ADDRESS as `0x${string}`,
    event: ESCROW_ABI[0],
    args: { jobId },
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  }).catch(() => []);
  const match = logs.find(
    (l) => l.args.customer?.toLowerCase() === customer.toLowerCase() && l.args.amount === BigInt(SERVICE_PRICE_BASE_UNITS),
  );
  if (!match) return { ok: false, reason: "No matching JobFunded event (customer, job or exact 1 QUSDC amount did not match)." };
  return { ok: true };
}

/** Read a job's onchain status. 0=Open 1=Funded 2=Delivered 3=Released 4=Refunded */
export async function readJobStatus(jobId: `0x${string}`): Promise<number | null> {
  if (!escrowDeployed()) return null;
  const client = publicClient();
  try {
    const job = await client.readContract({
      address: ESCROW_ADDRESS as `0x${string}`,
      abi: ESCROW_ABI,
      functionName: "getJob",
      args: [jobId],
    });
    return job[2];
  } catch {
    return null;
  }
}

export { QUSDC_ADDRESS };
