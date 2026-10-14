"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AddressView from "./AddressView";
import {
  MAX_PATTERN,
  formatDuration,
  median,
  normalize,
  odds,
  validate,
  type WorkerIn,
  type WorkerOut,
} from "@/lib/vanity";

type Found = { address: string; privateKey: string; tries: number; seconds: number };
type Phase = "idle" | "grinding" | "locking";
type Frame = { pre: string; preGhost: string; mid: string; suf: string; sufGhost: string; solid: boolean };

const ASSUMED_THREADS = 8; // for the estimate before the first run
const HEX = "0123456789abcdef";
const rnd = (n: number) => Array.from({ length: n }, () => HEX[(Math.random() * 16) | 0]).join("");
const now = () => performance.now();
const coreCount = () => Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1));

// Even an instant match plays the animation, so there is always something to see.
const MIN_GRIND_MS = 2200;
const TICK_MS = 70;
const TICKS_PER_CHAR = 2; // lock-in speed
const HOLD_TICKS = 7; // finished address stays on screen before the result view

const PRESETS = ["dead", "cafe", "beef", "c0de", "face"];

export default function Grinder({
  initialPrefix = "",
  initialSuffix = "",
}: {
  initialPrefix?: string;
  initialSuffix?: string;
}) {
  const [prefix, setPrefix] = useState(initialPrefix.toLowerCase());
  const [suffix, setSuffix] = useState(initialSuffix.toLowerCase());
  const [phase, setPhase] = useState<Phase>("idle");
  const [frame, setFrame] = useState<Frame | null>(null);
  const [tries, setTries] = useState(0);
  const [rate, setRate] = useState(0);
  const [found, setFound] = useState<Found | null>(null);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const workers = useRef<Worker[]>([]);
  const triesRef = useRef(0);
  const startedAt = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const pending = useRef<Found | null>(null);
  const lockTicks = useRef(0);
  const pat = useRef({ prefix: "", suffix: "" });

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
      const { prefix: pre, suffix: suf } = pat.current;
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
      setFrame({
        pre: pre.slice(0, pk),
        preGhost: rnd(pre.length - pk),
        suf: suf.slice(suf.length - sk),
        sufGhost: rnd(suf.length - sk),
        mid: all ? real.slice(2 + pre.length, 42 - suf.length) : rnd(40 - n),
        solid: all,
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase, go]);

  const pattern = { prefix, suffix };
  const p = normalize(pattern);
  const invalid = validate(pattern);
  const error = prefix || suffix ? invalid : null;
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
    pat.current = p;
    startedAt.current = now();
    go("grinding");
    const threads = coreCount();
    for (let i = 0; i < threads; i++) {
      const w = new Worker(new URL("../workers/grind.worker.ts", import.meta.url));
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
      w.postMessage({ type: "start", prefix: p.prefix, suffix: p.suffix } satisfies WorkerIn);
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

  function toggleReveal() {
    setReveal((r) => !r);
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

  const speed = rate || 40000 * ASSUMED_THREADS;
  const eta = invalid ? "-" : formatDuration(median(pattern) / speed);
  const chance = busy && !invalid ? odds(pattern, tries) : 0;

  if (found) {
    const body = found.address.slice(2);
    return (
      <div className="mx-auto max-w-2xl pb-4 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-rule bg-white px-3 py-1 text-sm text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {found.seconds < 1 ? "Found instantly" : `Found in ${formatDuration(found.seconds)}`}
        </p>
        <h1 className="mt-5 text-[clamp(36px,6vw,60px)] font-medium leading-none tracking-[-0.05em]">There she is.</h1>

        <div className="relative mt-12">
          <div className="bloom pointer-events-none absolute left-1/2 top-1/2 -z-10 h-72 w-[min(900px,130%)] -translate-x-1/2 -translate-y-1/2" />
          <AddressView
            className="relative text-[clamp(14px,3.4vw,30px)]"
            pre={p.prefix}
            mid={body.slice(p.prefix.length, body.length - p.suffix.length)}
            suf={p.suffix}
            solid
          />
        </div>
        <button onClick={() => copy("addr", found.address)} className="btn btn-light mt-8">
          {copied === "addr" ? "Copied" : "Copy address"}
        </button>

        <div className="mt-12 rounded-2xl border border-rule bg-white p-5 text-left sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Private key</h2>
            <button onClick={toggleReveal} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
              {reveal ? "Hide" : "Reveal"}
            </button>
          </div>
          <div className="mt-3 break-all rounded-xl bg-paper p-4 font-mono text-sm">
            {reveal ? found.privateKey : "•".repeat(66)}
          </div>
          <p className="mt-3 text-sm text-red-600">
            Shown once and never stored. Import it into your wallet now. Anyone with this key controls the address.
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

  const idleMid = "·".repeat(Math.max(0, 40 - p.prefix.length - p.suffix.length));

  return (
    <div className="mx-auto max-w-3xl pb-4 text-center">
      <h1 className="text-[clamp(36px,6vw,60px)] font-medium leading-none tracking-[-0.05em]">Make it yours.</h1>
      <p className="mx-auto mt-3 max-w-md text-muted">
        {busy ? "Searching for your address…" : "Choose a pattern. Everything runs in this tab."}
      </p>

      <div className="relative mt-12">
        <div className="bloom pointer-events-none absolute left-1/2 top-1/2 -z-10 h-72 w-[min(900px,130%)] -translate-x-1/2 -translate-y-1/2" />
        {frame ? (
          <AddressView
            className="relative text-[clamp(14px,3.4vw,30px)]"
            pre={frame.pre}
            preGhost={frame.preGhost}
            mid={frame.mid}
            suf={frame.suf}
            sufGhost={frame.sufGhost}
            solid={frame.solid}
          />
        ) : (
          <AddressView className="relative text-[clamp(14px,3.4vw,30px)]" pre={p.prefix} mid={idleMid} suf={p.suffix} />
        )}
      </div>

      <div className="mx-auto mt-14 max-w-xl border-t border-rule pt-10 text-left">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts with" lead="0x" value={prefix} onChange={setPrefix} disabled={busy} placeholder="dead" />
          <Field label="Ends with" lead="…" value={suffix} onChange={setSuffix} disabled={busy} placeholder="beef" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Try</span>
          {PRESETS.map((x) => (
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
        <p className="mt-4 text-center text-xs text-muted">Up to {MAX_PATTERN} characters. Nothing is uploaded.</p>
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
  lead: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{props.label}</span>
      <span className="flex items-center gap-2 rounded-full border border-rule bg-white px-5 py-3 font-mono text-lg focus-within:border-ink">
        <span className="text-ink/30">{props.lead}</span>
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
