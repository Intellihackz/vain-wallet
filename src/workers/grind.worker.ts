import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { WorkerIn, WorkerOut } from "@/lib/vanity";

const HEXCHARS = "0123456789abcdef";
const G = secp256k1.Point.BASE;
const N = secp256k1.Point.Fn.ORDER;

function randomScalar(): bigint {
  const b = crypto.getRandomValues(new Uint8Array(32));
  let k = 0n;
  for (const x of b) k = (k << 8n) | BigInt(x);
  return (k % (N - 2n ** 40n)) + 1n; // headroom so k+iterations never wraps
}

function put(v: bigint, buf: Uint8Array, off: number) {
  for (let i = 31; i >= 0; i--) {
    buf[off + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

// Compare nibbles of the address (hash bytes 12..31) without building a string.
function toAddress(h: Uint8Array) {
  let addr = "0x";
  for (let i = 12; i < 32; i++) addr += h[i].toString(16).padStart(2, "0");
  return addr;
}

function nibble(h: Uint8Array, i: number) {
  const b = h[12 + (i >> 1)];
  return i & 1 ? b & 15 : b >> 4;
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  if (e.data.type !== "start") return;
  const pre = [...e.data.prefix].map((c) => HEXCHARS.indexOf(c));
  const suf = [...e.data.suffix].map((c) => HEXCHARS.indexOf(c));
  const sufStart = 40 - suf.length;

  let k = randomScalar();
  let P = G.multiply(k);
  const buf = new Uint8Array(64);
  let tries = 0;
  let lastReport = performance.now();

  for (;;) {
    const a = P.toAffine();
    put(a.x, buf, 0);
    put(a.y, buf, 32);
    const h = keccak_256(buf);
    tries++;

    let ok = true;
    for (let i = 0; ok && i < pre.length; i++) if (nibble(h, i) !== pre[i]) ok = false;
    for (let i = 0; ok && i < suf.length; i++) if (nibble(h, sufStart + i) !== suf[i]) ok = false;

    if (ok) {
      const out: WorkerOut = {
        type: "found",
        address: toAddress(h),
        privateKey: "0x" + k.toString(16).padStart(64, "0"),
        tries,
      };
      self.postMessage(out);
      return;
    }

    P = P.add(G);
    k++;

    if ((tries & 0x3ff) === 0) {
      const now = performance.now();
      if (now - lastReport > 250) {
        self.postMessage({ type: "progress", tries, sample: toAddress(h) } satisfies WorkerOut);
        tries = 0;
        lastReport = now;
      }
    }
  }
};
