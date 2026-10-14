export const MAX_PATTERN = 8;

export type Pattern = { prefix: string; suffix: string };

const HEX = /^[0-9a-f]*$/;

export function normalize(p: Pattern): Pattern {
  return {
    prefix: p.prefix.toLowerCase().replace(/^0x/, ""),
    suffix: p.suffix.toLowerCase(),
  };
}

export function validate(p: Pattern): string | null {
  const { prefix, suffix } = normalize(p);
  if (!prefix && !suffix) return "Enter a prefix or a suffix.";
  if (!HEX.test(prefix) || !HEX.test(suffix)) return "Only hex characters: 0-9 and a-f.";
  if (prefix.length + suffix.length > MAX_PATTERN) return `Max ${MAX_PATTERN} characters in total.`;
  return null;
}

/** Expected number of keys to try for a 50% chance of a hit (ln 2 * 16^n). */
export function median(p: Pattern): number {
  const { prefix, suffix } = normalize(p);
  return Math.LN2 * 16 ** (prefix.length + suffix.length);
}

export function odds(p: Pattern, tries: number): number {
  const { prefix, suffix } = normalize(p);
  return 1 - Math.exp(-tries / 16 ** (prefix.length + suffix.length));
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

export type WorkerIn = { type: "start"; prefix: string; suffix: string };
export type WorkerOut =
  | { type: "progress"; tries: number; sample: string }
  | { type: "found"; address: string; privateKey: string; tries: number };
