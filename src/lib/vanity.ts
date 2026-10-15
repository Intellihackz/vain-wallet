export type Chain = "evm" | "sol";
export type Pattern = { prefix: string; suffix: string };
/** Everything about a search except the text itself. */
export type Spec = { chain: Chain; ignoreCase: boolean };

export const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const CHAIN_LABEL: Record<Chain, string> = { evm: "EVM", sol: "Solana" };

/** Longest pattern we allow. Solana is capped lower because each character is ~58x rarer, not 16x. */
export function maxLen(chain: Chain): number {
  return chain === "evm" ? 8 : 5;
}

const HEX = /^[0-9a-f]*$/;

export function normalize(spec: Spec, p: Pattern): Pattern {
  if (spec.chain === "evm") {
    return { prefix: p.prefix.toLowerCase().replace(/^0x/, ""), suffix: p.suffix.toLowerCase() };
  }
  return { prefix: p.prefix.trim(), suffix: p.suffix.trim() };
}

export function validate(spec: Spec, p: Pattern): string | null {
  const { prefix, suffix } = normalize(spec, p);
  if (!prefix && !suffix) return "Enter a prefix or a suffix.";
  if (spec.chain === "evm") {
    if (!HEX.test(prefix) || !HEX.test(suffix)) return "Only hex characters: 0-9 and a-f.";
  } else {
    const bad = [...prefix, ...suffix].find((c) => !B58.includes(c));
    if (bad) return `"${bad}" can't appear in a Solana address. No 0, O, I or l.`;
  }
  const max = maxLen(spec.chain);
  if (prefix.length + suffix.length > max) return `Max ${max} characters in total.`;
  return null;
}

/*
 * Solana first-character odds.
 * A 32-byte key is 44 base58 characters ~94% of the time, and those can only start with 2..H.
 * Anything starting later in the alphabet has to be a rarer 43-character address.
 */
const T = 2n ** 256n;
const P44 = Number(58n ** 43n) / Number(T); // each leading digit 2..H among 44-char addresses
const P43 = Number(58n ** 42n) / Number(T); // each leading digit among 43-char addresses
const P_J = Number(T - 17n * 58n ** 43n) / Number(T); // the 44-char range ends part-way through "J"
function firstCharProb(c: string): number {
  const i = B58.indexOf(c);
  if (i === 0) return 1 / 256; // a leading "1" means a zero byte
  if (i <= 16) return P44 + P43;
  if (i === 17) return P_J + P43; // "J"
  return P43;
}

/** All alphabet characters that count as a match for `c`. */
function matches(spec: Spec, c: string): string[] {
  if (!spec.ignoreCase) return [c];
  const lower = c.toLowerCase();
  return [...B58].filter((x) => x.toLowerCase() === lower);
}

/** Average number of keys to try per match. */
export function difficulty(spec: Spec, p: Pattern): number {
  const { prefix, suffix } = normalize(spec, p);
  if (spec.chain === "evm") return 16 ** (prefix.length + suffix.length);
  let prob = 1;
  [...prefix].forEach((c, i) => {
    prob *= i === 0 ? matches(spec, c).reduce((s, m) => s + firstCharProb(m), 0) : matches(spec, c).length / 58;
  });
  [...suffix].forEach((c) => {
    prob *= matches(spec, c).length / 58;
  });
  return 1 / prob;
}

/** A Solana prefix that starts with a late letter is much rarer. Say so before they wait. */
export function hardStartNote(spec: Spec, p: Pattern): string | null {
  if (spec.chain !== "sol") return null;
  const { prefix } = normalize(spec, p);
  if (!prefix) return null;
  const asPrefix = matches(spec, prefix[0]).reduce((sum, m) => sum + firstCharProb(m), 0);
  const asSuffix = matches(spec, prefix[0]).length / 58;
  if (asPrefix >= asSuffix * 0.5) return null; // not meaningfully rarer than a suffix
  return `Addresses rarely start with "${prefix[0]}". A suffix of the same letters is about ${Math.round(asSuffix / asPrefix)}x faster.`;
}

/** Number of keys for a 50% chance of a hit. */
export function median(spec: Spec, p: Pattern): number {
  return Math.LN2 * difficulty(spec, p);
}

export function odds(spec: Spec, p: Pattern, tries: number): number {
  return 1 - Math.exp(-tries / difficulty(spec, p));
}

export function formatDuration(s: number): string {
  if (!isFinite(s)) return "never";
  if (s < 1) return "instant";
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  if (s < 86400 * 365) return `${Math.round(s / 86400)} days`;
  return `${(s / (86400 * 365)).toFixed(1)} years`;
}

export type WorkerIn = { type: "start"; prefix: string; suffix: string; ignoreCase?: boolean };
export type WorkerOut =
  | { type: "progress"; tries: number; sample: string }
  | { type: "found"; address: string; privateKey: string; tries: number };
