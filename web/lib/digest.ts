// Client-side recomputation of the two digests the protocol hangs on.
// These mirror the contract's pure helpers exactly:
//
//   _canon(value)      -> json.dumps(value, sort_keys=True, separators=(",", ":"))
//   packet digest      sha256 over the canon of the source rows
//                      [[source_id, url, kind, host, pinned_sha256, byte_len], ...]
//                      in pin order (the order stored in the packet)
//   decision digest    sha256 over the canon of the decision rows
//                      [[source_id, fetch_ok, digest_match, effective], ...]
//                      sorted by source_id

const encoder = new TextEncoder();

export function canon(value: any): string {
  if (Array.isArray(value)) {
    return `[${value.map(canon).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type PacketSource = {
  source_id: string;
  url: string;
  host: string;
  kind: string;
  pinned_sha256: string;
  byte_len: number | string;
  unpinned?: boolean;
};

export type PacketRow = [string, string, string, string, string, number];

export function packetRows(sources: PacketSource[]): PacketRow[] {
  return sources.map((s) => [
    s.source_id,
    s.url,
    s.kind,
    s.host,
    s.pinned_sha256,
    Number(s.byte_len),
  ]);
}

export async function packetDigest(sources: PacketSource[]): Promise<string> {
  return sha256Hex(canon(packetRows(sources)));
}

export type Decision = {
  source_id: string;
  fetch_ok: boolean | number;
  digest_match: boolean | number;
  effective: string;
};

export async function decisionDigest(decisions: Decision[]): Promise<string> {
  const rows = decisions
    .map((d) => [
      d.source_id,
      Number(d.fetch_ok),
      Number(d.digest_match),
      d.effective,
    ])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return sha256Hex(canon(rows));
}
