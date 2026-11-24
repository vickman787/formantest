import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./manifest";

export interface SavedArtifact {
  filename: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  storage_key: string;
}

function artifactsRoot(): string {
  return path.join(process.cwd(), "artifacts");
}

/** Save a file under artifacts/<orderId>/ and return its record. Local disk for dev;
 *  production must point STORAGE_BUCKET_PRIVATE at private object storage. */
export async function saveArtifact(orderId: string, filename: string, mime: string, data: Buffer | string): Promise<SavedArtifact> {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const dir = path.join(artifactsRoot(), orderId);
  await mkdir(dir, { recursive: true });
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const full = path.join(dir, safe);
  await writeFile(full, buf);
  return { filename: safe, mime, size_bytes: buf.length, sha256: sha256(buf), storage_key: `${orderId}/${safe}` };
}

export function artifactPath(storageKey: string): string {
  const [orderId, ...rest] = storageKey.split("/");
  const safe = rest.join("/").replace(/\.\./g, "");
  return path.join(artifactsRoot(), orderId, safe);
}
