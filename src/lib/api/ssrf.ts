import dns from "dns";

// ─── Private / reserved IPv4 ranges ──────────────────────────────────────────
// Represented as [network_uint32, mask_uint32] pairs.
const BLOCKED_IPV4_RANGES: [number, number][] = [
  [0x00000000, 0xff000000], // 0.0.0.0/8
  [0x0a000000, 0xff000000], // 10.0.0.0/8
  [0x7f000000, 0xff000000], // 127.0.0.0/8  (loopback)
  [0xa9fe0000, 0xffff0000], // 169.254.0.0/16 (link-local)
  [0xac100000, 0xfff00000], // 172.16.0.0/12
  [0xc0a80000, 0xffff0000], // 192.168.0.0/16
  [0xc0000000, 0xffffff00], // 192.0.0.0/24
  [0xc0000200, 0xffffff00], // 192.0.2.0/24  (TEST-NET-1)
  [0xc6336400, 0xfffe0000], // 198.51.100.0/24 (TEST-NET-2) — also 198.18.0.0/15
  [0xcb007100, 0xffffff00], // 203.0.113.0/24 (TEST-NET-3)
  [0xe0000000, 0xf0000000], // 224.0.0.0/4   (multicast)
  [0xf0000000, 0xf0000000], // 240.0.0.0/4   (reserved)
  [0xffffffff, 0xffffffff], // 255.255.255.255
  [0x64400000, 0xffc00000], // 100.64.0.0/10 (shared address space / CGNAT)
  // AWS/GCP/Azure metadata services
  [0xa9fe00fe, 0xffffffff], // 169.254.0.254 (AWS metadata)
  [0xa9fea9fe, 0xffffffff], // 169.254.169.254 (AWS/GCP/Azure metadata)
];

// ─── Blocked IPv6 patterns ────────────────────────────────────────────────────
const BLOCKED_IPV6_PREFIXES = [
  "::1",           // loopback
  "::",            // unspecified
  "::ffff:",       // IPv4-mapped (catches ::ffff:127.0.0.1 etc.)
  "fc",            // fc00::/7 — unique local
  "fd",            // fd00::/8 — unique local
  "fe80",          // fe80::/10 — link-local
  "ff",            // ff00::/8 — multicast
];

function ipv4ToUint32(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error("Invalid IPv4 address");
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  let addr: number;
  try {
    addr = ipv4ToUint32(ip);
  } catch {
    return true; // malformed — block it
  }
  return BLOCKED_IPV4_RANGES.some(([net, mask]) => (addr & mask) === (net & mask));
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  return BLOCKED_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isBlockedIP(ip: string): boolean {
  // Detect IPv4 vs IPv6 by presence of ":"
  return ip.includes(":") ? isBlockedIPv6(ip) : isBlockedIPv4(ip);
}

/**
 * Resolves `hostname` via DNS and throws if any resolved address is in a
 * private/reserved/metadata range.
 *
 * Uses `all: true` to get every address the resolver returns, so a DNS
 * rebinding attack that returns one public + one private address is caught.
 */
/** Returns true if the string looks like a bare IPv4 or IPv6 address. */
function looksLikeIP(s: string): boolean {
  // IPv4: four dot-separated decimal octets
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return true;
  // IPv6: contains at least one colon
  if (s.includes(":")) return true;
  return false;
}

export async function assertSafeHostname(hostname: string): Promise<void> {
  // Block bare IP addresses that are private without needing DNS
  // (handles cases where the user types 127.0.0.1 directly)
  if (looksLikeIP(hostname) && isBlockedIP(hostname)) {
    throw new Error("Requests to private or reserved IP addresses are not allowed.");
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new Error("DNS resolution failed. Check the hostname and try again.");
  }

  if (addresses.length === 0) {
    throw new Error("DNS resolution returned no addresses.");
  }

  for (const { address } of addresses) {
    if (isBlockedIP(address)) {
      // Do NOT include the actual IP in the error — that would leak internal info
      throw new Error("Requests to private or reserved network destinations are not allowed.");
    }
  }
}

// Export for testing
export { isBlockedIPv4, isBlockedIPv6, isBlockedIP };
