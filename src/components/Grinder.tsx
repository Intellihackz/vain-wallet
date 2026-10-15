"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AddressView from "./AddressView";
import {
  B58,
  CHAIN_LABEL,
  formatDuration,
  hardStartNote,
  maxLen,
  median,
  normalize,
  odds,
  validate,
  type Chain,
  type Spec,
  type WorkerIn,
  type WorkerOut,
} from "@/lib/vanity";

type Found = { address: string; privateKey: string; tries: number; seconds: number };
type Phase = "idle" | "grinding" | "locking";
type Frame = { pre: string; preGhost: string; mid: string; suf: string; sufGhost: string; solid: boolean };

const ASSUMED_RATE = 40000 * 8; // keys/s, for the estimate before the first run
const HEX = "0123456789abcdef";
const rnd = (n: number, alphabet = HEX) =>
  Array.from({ length: n }, () => alphabet[(Math.random() * alphabet.length) | 0]).join("");

// Per chain: characters before the address body, body length, and the alphabet used for the animation.
const CHAIN = {
  evm: { lead: "0x", len: 40, alphabet: HEX, keyLen: 64 },
  sol: { lead: "", len: 44, alphabet: B58, keyLen: 88 },
} as const;
const now = () => performance.now();
const coreCount = () => Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1));

// Even an instant match plays the animation, so there is always something to see.
const MIN_GRIND_MS = 2200;
const TICK_MS = 70;
const TICKS_PER_CHAR = 2; // lock-in speed
const HOLD_TICKS = 7; // finished address stays on screen before the result view

const PRESETS: Record<Chain, string[]> = {
  evm: ["dead", "cafe", "beef", "c0de", "face"],
  sol: ["Gm", "Ace", "Bad", "Cat", "Fab"],
};

function makeWorker(chain: Chain): Worker {
  return chain === "sol"
    ? new Worker(new URL("../workers/grind-sol.worker.ts", import.meta.url))
    : new Worker(new URL("../workers/grind.worker.ts", import.meta.url));
}

export default function Grinder({
  initialPrefix = "",
  initialSuffix = "",
  initialChain = "evm",
}: {
  initialPrefix?: string;
  initialSuffix?: string;
  initialChain?: Chain;
}) {
  const [chain, setChain] = useState<Chain>(initialChain);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [prefix, setPrefix] = useState(initialChain === "evm" ? initialPrefix.toLowerCase() : initialPrefix);
  const [suffix, setSuffix] = useState(initialChain === "evm" ? initialSuffix.toLowerCase() : initialSuffix);
  const [phase, setPhase] = useState<Phase>("idle");
  const [frame, setFrame] = useState<Frame | null>(null);
  const [tries, setTries] = useState(0);
  const [rate, setRate] = useState(0);
  const [found, setFound] = useState<Found | null>(null);
  const [reveal, setReveal] = useState(false);
  const [decoy, setDecoy] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const workers = useRef<Worker[]>([]);
  const triesRef = useRef(0);
  const startedAt = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const pending = useRef<Found | null>(null);
  const lockTicks = useRef(0);
  const pat = useRef({ prefix: "", suffix: "", chain: "evm" as Chain });

  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const killWorkers = useCallback(() => {
    workers.current.forEach((w) => w.terminate());
    workers.current = [];
  }, []);

  const stop = useCallback(() => {
    killWorkers();
    pending.current = null;
    setFrame(null);
    go("idle");
  }, [killWorkers, go]);

  useEffect(() => killWorkers, [killWorkers]);

  // Drives the animation and the live counters while grinding or locking in.
  useEffect(() => {
    if (phase === "idle") return;
    const id = setInterval(() => {
      const { prefix: pre, suffix: suf, chain: ch } = pat.current;
      const { lead, len, alphabet, keyLen } = CHAIN[ch];
      const n = pre.length + suf.length;
      const elapsed = now() - startedAt.current;
      setTries(triesRef.current);
      setRate(triesRef.current / Math.max(0.001, elapsed / 1000));

      if (phaseRef.current === "grinding" && pending.current && elapsed >= MIN_GRIND_MS) {
        lockTicks.current = 0;
        go("locking");
      }

      let locked = 0;
      if (phaseRef.current === "locking") {
        lockTicks.current++;
        locked = Math.min(n, Math.floor(lockTicks.current / TICKS_PER_CHAR));
        if (locked >= n && lockTicks.current >= n * TICKS_PER_CHAR + HOLD_TICKS) {
          setFound(pending.current);
          setDecoy(lead + rnd(keyLen, alphabet));
          pending.current = null;
          setFrame(null);
          go("idle");
          return;
        }
      }

      // Prefix locks left to right, then the suffix locks right to left.
      const pk = Math.min(locked, pre.length);
      const sk = Math.max(0, locked - pre.length);
      const real = pending.current?.address;
      const all = locked >= n && !!real;
      // Once a match exists, lock in its real characters (matters when case is ignored).
      const shownPre = real ? real.slice(lead.length, lead.length + pre.length) : pre;
      const shownSuf = real ? real.slice(real.length - suf.length) : suf;
      setFrame({
        pre: shownPre.slice(0, pk),
        preGhost: rnd(pre.length - pk, alphabet),
        suf: sk ? shownSuf.slice(suf.length - sk) : "",
        sufGhost: rnd(suf.length - sk, alphabet),
        mid: all ? real.slice(lead.length + pre.length, real.length - suf.length) : rnd(len - n, alphabet),
        solid: all,
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase, go]);

  const spec: Spec = { chain, ignoreCase: chain === "sol" && ignoreCase };
  const cfg = CHAIN[chain];
  const pattern = { prefix, suffix };
  const p = normalize(spec, pattern);
  const invalid = validate(spec, pattern);
  const error = prefix || suffix ? invalid : null;
  const hint = invalid ? null : hardStartNote(spec, pattern);
  const busy = phase !== "idle";

  function start() {
    setFound(null);
    setReveal(false);
    setKeySaved(false);
    setConfirmDiscard(false);
    setTries(0);
    setRate(0);
    setFrame(null);
    triesRef.current = 0;
    pending.current = null;
    pat.current = { ...p, chain };
    startedAt.current = now();
    go("grinding");
    const threads = coreCount();
    for (let i = 0; i < threads; i++) {
      const w = makeWorker(chain);
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        triesRef.current += e.data.tries;
        if (e.data.type === "found" && !pending.current) {
          pending.current = {
            address: e.data.address,
            privateKey: e.data.privateKey,
            tries: triesRef.current,
            seconds: (now() - startedAt.current) / 1000,
          };
          killWorkers();
        }
      };
      w.postMessage({ type: "start", prefix: p.prefix, suffix: p.suffix, ignoreCase: spec.ignoreCase } satisfies WorkerIn);
      workers.current.push(w);
    }
  }

  async function copy(label: "addr" | "key", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      if (label === "key") {
        setKeySaved(true);
        setConfirmDiscard(false);
      }
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }

  function revealKey() {
    setReveal(true);
    setKeySaved(true);
    setConfirmDiscard(false);
  }

  function leaveResult() {
    setFound(null);
    setReveal(false);
    setKeySaved(false);
    setConfirmDiscard(false);
    setTries(0);
  }

  const speed = rate || ASSUMED_RATE;
  const eta = invalid ? "-" : formatDuration(median(spec, pattern) / speed);
  const chance = busy && !invalid ? odds(spec, pattern, tries) : 0;

  if (found) {
    const a = found.address;
    const shownPre = a.slice(cfg.lead.length, cfg.lead.length + p.prefix.length);
    const shownSuf = a.slice(a.length - p.suffix.length);
    const body = a.slice(cfg.lead.length + p.prefix.length, a.length - p.suffix.length);
    return (
      <div className="mx-auto max-w-2xl pb-4 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-rule bg-white px-3 py-1 text-sm text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {CHAIN_LABEL[chain]} · {found.seconds < 1 ? "Found instantly" : `Found in ${formatDuration(found.seconds)}`}
        </p>
        <h1 className="mt-5 text-[clamp(36px,6vw,60px)] font-medium leading-none tracking-[-0.05em]">There she is.</h1>

        <div className="relative mt-12">
          <div className="bloom pointer-events-none absolute left-1/2 top-1/2 -z-10 h-72 w-[min(900px,130%)] -translate-x-1/2 -translate-y-1/2" />
          <AddressView
            className="relative text-[clamp(14px,3.4vw,30px)]"
            lead={cfg.lead}
            pre={shownPre}
            mid={body}
            suf={shownSuf}
            solid
          />
        </div>
        <button onClick={() => copy("addr", found.address)} className="btn btn-light mt-8">
          {copied === "addr" ? "Copied" : "Copy address"}
        </button>

        <div className="mt-12 rounded-2xl border border-rule bg-white p-5 text-left sm:p-6">
          <h2 className="font-medium">Private key</h2>
          <div
            role="button"
            tabIndex={0}
            aria-label={reveal ? "Private key" : "Private key hidden. Tap to reveal"}
            onClick={() => !reveal && revealKey()}
            onKeyDown={(e) => {
              if (!reveal && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                revealKey();
              }
            }}
            className={`relative mt-3 overflow-hidden rounded-xl bg-paper p-4 ${reveal ? "" : "cursor-pointer"}`}
          >
            <p
              aria-hidden={!reveal}
              className={`break-all font-mono text-sm transition-[filter] duration-500 ease-out ${reveal ? "blur-0" : "select-none blur-[7px]"}`}
            >
              {reveal ? found.privateKey : decoy}
            </p>
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium transition-opacity duration-300 ${reveal ? "opacity-0" : "opacity-100"}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Tap to reveal
            </span>
          </div>
          <p className="mt-3 text-sm text-red-600">
            {chain === "sol"
              ? "Shown once and never stored. Import it into Phantom or Solflare with Import Private Key. Anyone with this key controls the address."
              : "Shown once and never stored. Import it into your wallet now. Anyone with this key controls the address."}
          </p>
          <button onClick={() => copy("key", found.privateKey)} className="btn mt-4 w-full">
            {copied === "key" ? "Copied" : "Copy private key"}
          </button>
        </div>

        <p className="mt-6 text-sm text-muted">{found.tries.toLocaleString()} keys tried on this device.</p>

        {confirmDiscard ? (
          <div role="alert" className="mx-auto mt-6 max-w-md rounded-2xl border border-red-200 bg-red-50 p-4 text-left">
            <p className="text-sm text-red-700">
              You haven&apos;t copied or revealed the private key. Once you leave, this wallet is gone for good.
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setConfirmDiscard(false)} className="btn btn-light flex-1">Keep wallet</button>
              <button onClick={leaveResult} className="btn flex-1">Discard it</button>
            </div>
          </div>
        ) : (
          <button onClick={() => (keySaved ? leaveResult() : setConfirmDiscard(true))} className="btn btn-light mt-6">
            Generate new
          </button>
        )}
      </div>
    );
  }

  const idleMid = "·".repeat(Math.max(0, cfg.len - p.prefix.length - p.suffix.length));

  return (
    <div className="mx-auto max-w-3xl pb-4 text-center">
      <h1 className="text-[clamp(36px,6vw,60px)] font-medium leading-none tracking-[-0.05em]">Make it yours.</h1>
      <p className="mx-auto mt-3 max-w-md text-muted">
        {busy ? "Searching for your address…" : "Choose a pattern. Everything runs in this tab."}
      </p>

      <div role="radiogroup" aria-label="Chain" className="mx-auto mt-6 inline-flex rounded-full border border-rule bg-white p-1">
        {(["evm", "sol"] as const).map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={chain === c}
            disabled={busy}
            onClick={() => setChain(c)}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${
              chain === c ? "bg-ink text-white" : "text-muted hover:text-ink"
            } ${busy && chain !== c ? "opacity-40" : ""}`}
          >
            {CHAIN_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="relative mt-12">
        <div className="bloom pointer-events-none absolute left-1/2 top-1/2 -z-10 h-72 w-[min(900px,130%)] -translate-x-1/2 -translate-y-1/2" />
        {frame ? (
          <AddressView
            className="relative text-[clamp(14px,3.4vw,30px)]"
            lead={cfg.lead}
            pre={frame.pre}
            preGhost={frame.preGhost}
            mid={frame.mid}
            suf={frame.suf}
            sufGhost={frame.sufGhost}
            solid={frame.solid}
          />
        ) : (
          <AddressView className="relative text-[clamp(14px,3.4vw,30px)]" lead={cfg.lead} pre={p.prefix} mid={idleMid} suf={p.suffix} />
        )}
      </div>

      <div className="mx-auto mt-14 max-w-xl border-t border-rule pt-10 text-left">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts with" lead={cfg.lead} value={prefix} onChange={setPrefix} disabled={busy} placeholder={chain === "sol" ? "Gm" : "dead"} />
          <Field label="Ends with" lead="…" value={suffix} onChange={setSuffix} disabled={busy} placeholder={chain === "sol" ? "pump" : "beef"} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Try</span>
          {PRESETS[chain].map((x) => (
            <button
              key={x}
              disabled={busy}
              onClick={() => { setPrefix(x); setSuffix(""); }}
              className="rounded-full border border-rule bg-white px-3 py-1 font-mono transition hover:border-ink disabled:opacity-40"
            >
              {x}
            </button>
          ))}
          <span className="ml-auto h-5 text-red-600">{error}</span>
        </div>

        {chain === "sol" && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={ignoreCase}
              disabled={busy}
              onChange={(e) => setIgnoreCase(e.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            Ignore upper and lower case (much faster)
          </label>
        )}
        {hint && <p className="mt-3 text-sm text-amber-700">{hint}</p>}

        <dl className="mt-8 grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-4">
          <Stat k="Typical wait" v={eta} />
          <Stat k="Speed" v={busy ? `${Math.round(rate / 1000)}k/s` : "-"} />
          <Stat k="Tried" v={tries.toLocaleString()} />
          <Stat k="Chance so far" v={busy && !invalid ? `${(chance * 100).toFixed(1)}%` : "-"} />
        </dl>

        <div className="mt-8">
          {phase === "grinding" ? (
            <button onClick={stop} className="btn btn-light w-full">
              <span className="h-2 w-2 animate-pulse rounded-full bg-ink" /> Grinding… Stop
            </button>
          ) : phase === "locking" ? (
            <button disabled className="btn btn-light w-full">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Match found
            </button>
          ) : (
            <button onClick={start} disabled={!!invalid} className="btn w-full">Start grinding</button>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted">Up to {maxLen(chain)} characters. Nothing is uploaded.</p>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}

function Field(props: {
  label: string;
  lead?: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{props.label}</span>
      <span className="flex items-center gap-2 rounded-full border border-rule bg-white px-5 py-3 font-mono text-lg focus-within:border-ink">
        {props.lead && <span className="text-ink/30">{props.lead}</span>}
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          disabled={props.disabled}
          placeholder={props.placeholder}
          spellCheck={false}
          autoComplete="off"
          className="w-full min-w-0 bg-transparent outline-none placeholder:text-ink/20 disabled:opacity-60"
        />
      </span>
    </label>
  );
}
