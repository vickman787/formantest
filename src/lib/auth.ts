import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { verifyMessage } from "viem";
import { ensureSchema, getPool, newId } from "./db";
import { APP_URL, QIE_CHAIN_ID } from "./config";

const SESSION_COOKIE = "forma_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function signSession(id: string): string {
  return `${id}.${createHmac("sha256", secret()).update(id).digest("hex").slice(0, 32)}`;
}

export function sessionMessage(wallet: string, nonce: string): string {
  return [
    "Forma — sign in",
    "",
    `Wallet: ${wallet}`,
    `Domain: ${new URL(APP_URL).host}`,
    `Chain: ${QIE_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date().toISOString()}`,
    "",
    "This signature only proves you own this wallet. It moves no funds.",
  ].join("\n");
}

/** Issue a single-use nonce for a wallet. The exact message is stored so
 *  verification checks the same bytes the wallet signed. */
export async function createNonce(wallet: string): Promise<{ nonce: string; message: string }> {
  await ensureSchema();
  const nonce = randomBytes(16).toString("hex");
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  const message = sessionMessage(wallet, nonce);
  await getPool().query("INSERT INTO nonces(nonce, wallet, message, expires_at) VALUES ($1,$2,$3,$4)", [
    nonce,
    wallet.toLowerCase(),
    message,
    expires,
  ]);
  return { nonce, message };
}

/** Verify the signature, consume the nonce, create a session cookie. */
export async function verifySignature(wallet: string, nonce: string, signature: `0x${string}`): Promise<boolean> {
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM nonces WHERE nonce=$1 AND wallet=$2 AND used=FALSE AND expires_at > now()", [
    nonce,
    wallet.toLowerCase(),
  ]);
  if (rows.length === 0) return false;
  const ok = await verifyMessage({
    address: wallet as `0x${string}`,
    message: rows[0].message as string,
    signature,
  }).catch(() => false);
  if (!ok) return false;
  await pool.query("UPDATE nonces SET used=TRUE WHERE nonce=$1", [nonce]);
  let customer = await pool.query("SELECT id FROM customers WHERE wallet=$1", [wallet.toLowerCase()]);
  let customerId: string;
  if (customer.rows.length === 0) {
    customerId = newId("cus");
    await pool.query("INSERT INTO customers(id, wallet) VALUES ($1,$2)", [customerId, wallet.toLowerCase()]);
  } else {
    customerId = customer.rows[0].id;
  }
  const sessionId = newId("ses");
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query("INSERT INTO sessions(id, customer_id, wallet, expires_at) VALUES ($1,$2,$3,$4)", [
    sessionId,
    customerId,
    wallet.toLowerCase(),
    expires,
  ]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return true;
}

/** Current signed-in customer, or null. Connecting a wallet is not auth. */
export async function currentCustomer(): Promise<{ id: string; wallet: string } | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  if (!id || sig !== signSession(id).split(".")[1]) return null;
  await ensureSchema();
  const { rows } = await poolQuery(
    "SELECT s.customer_id AS id, s.wallet FROM sessions s WHERE s.id=$1 AND s.expires_at > now()",
    [id],
  );
  if (rows.length === 0) return null;
  return { id: rows[0].id, wallet: rows[0].wallet };
}

async function poolQuery(text: string, params: unknown[]) {
  return getPool().query(text, params as never[]);
}

export async function requireCustomer() {
  const c = await currentCustomer();
  if (!c) throw new Error("unauthenticated");
  return c;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
