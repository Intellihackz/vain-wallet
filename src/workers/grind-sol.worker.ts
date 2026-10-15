import sodium from "libsodium-wrappers";
import { base58 } from "@scure/base";
import type { WorkerIn, WorkerOut } from "@/lib/vanity";

/*
 * Solana vanity grinder. Each candidate is a fresh random 32-byte seed, so the secret key is a
 * normal Solana keypair (seed + public key) that any wallet can import. libsodium (WebAssembly)
 * derives ~50k keys/s per thread, about 7x the pure-JS implementation.
 */
self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  if (e.data.type !== "start") return;
  await sodium.ready;

  const { ignoreCase } = e.data;
  const pre = ignoreCase ? e.data.prefix.toLowerCase() : e.data.prefix;
  const suf = ignoreCase ? e.data.suffix.toLowerCase() : e.data.suffix;

  const pool = new Uint8Array(65536); // one getRandomValues call feeds 2048 seeds
  let off = pool.length;
  let tries = 0;
  let lastReport = performance.now();

  for (;;) {
    if (off >= pool.length) {
      crypto.getRandomValues(pool);
      off = 0;
    }
    const kp = sodium.crypto_sign_seed_keypair(pool.subarray(off, off + 32));
    off += 32;

    const address = base58.encode(kp.publicKey);
    const cmp = ignoreCase ? address.toLowerCase() : address;
    tries++;

    if (cmp.startsWith(pre) && cmp.endsWith(suf)) {
      // 64-byte secret key (seed + public key) as base58: the format Phantom and Solflare import.
      self.postMessage({ type: "found", address, privateKey: base58.encode(kp.privateKey), tries } satisfies WorkerOut);
      return;
    }

    if ((tries & 0x3ff) === 0) {
      const now = performance.now();
      if (now - lastReport > 250) {
        self.postMessage({ type: "progress", tries, sample: address } satisfies WorkerOut);
        tries = 0;
        lastReport = now;
      }
    }
  }
};
