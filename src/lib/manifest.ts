import { createHash } from "node:crypto";

/** Deterministic JSON: sort keys recursively so the same manifest always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface ManifestFile {
  filename: string;
  mime: string;
  size_bytes: number;
  sha256: string;
}

export interface DeliveryManifest {
  schema_version: 1;
  service: string;
  order_id: string;
  version: number;
  files: ManifestFile[];
  checks: { name: string; passed: boolean; detail: string }[];
  created_at: string;
}

export function buildManifest(m: Omit<DeliveryManifest, "schema_version">): { manifest: DeliveryManifest; hash: string } {
  const manifest: DeliveryManifest = { schema_version: 1, ...m };
  return { manifest, hash: sha256(canonical(manifest)) };
}
