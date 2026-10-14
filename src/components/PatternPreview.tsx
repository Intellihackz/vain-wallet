"use client";

import { useEffect, useRef, useState } from "react";
import AddressView from "./AddressView";

const HEX = "0123456789abcdef";
const rnd = (n: number) => Array.from({ length: n }, () => HEX[(Math.random() * 16) | 0]).join("");

// Real words that happen to be valid hex.
const WORDS = [
  "dead", "beef", "cafe", "face", "fade", "feed", "deed", "bead", "babe", "decaf",
  "decade", "facade", "deface", "efface", "accede", "added", "beaded", "defaced",
  "c0ffee", "c0de", "f00d", "d1ce", "a11ce", "b0b", "abe", "ace", "bad", "bed",
  "cab", "dad", "fab", "acid", "add", "ebb", "dab", "bade",
];

const SCRAMBLE_TICKS = 16;
const LOCK_TICKS = 3;
const HOLD_TICKS = 30;
const TICK_MS = 70;

type Frame = { locked: string; ghost: string; mid: string; atEnd: boolean; done: boolean };
type Pick = { word: string; atEnd: boolean };

function pickNext(prev?: string): Pick {
  let word = WORDS[(Math.random() * WORDS.length) | 0];
  while (word === prev) word = WORDS[(Math.random() * WORDS.length) | 0];
  return { word, atEnd: Math.random() < 0.3 };
}

/** Decorative hero: grinds random words into an address, over and over. Not interactive. */
export default function PatternPreview() {
  const [f, setF] = useState<Frame>({ locked: "", ghost: "", mid: "·".repeat(40), atEnd: false, done: false });
  const pick = useRef<Pick | null>(null);

  useEffect(() => {
    pick.current = pickNext();
    let t = 0;
    let mid = rnd(40);

    const id = setInterval(() => {
      const { word, atEnd } = pick.current!;
      const n = word.length;
      const midLen = 40 - n;
      const count = Math.min(n, Math.max(0, Math.floor((t - SCRAMBLE_TICKS) / LOCK_TICKS)));
      const done = count >= n;

      if (t === SCRAMBLE_TICKS + n * LOCK_TICKS) mid = rnd(midLen);
      setF({
        // A suffix word locks in from the right so each letter lands in its real position.
        locked: atEnd ? word.slice(n - count) : word.slice(0, count),
        ghost: rnd(n - count),
        mid: done ? mid.slice(0, midLen) : rnd(midLen),
        atEnd,
        done,
      });

      t++;
      if (t > SCRAMBLE_TICKS + n * LOCK_TICKS + HOLD_TICKS) {
        t = 0;
        pick.current = pickNext(word);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // For a suffix word the unlocked characters sit to the left of the locked ones.
  return (
    <AddressView
      aria-hidden
      className="select-none text-[clamp(15px,2.6vw,34px)]"
      pre={f.atEnd ? "" : f.locked}
      preGhost={f.atEnd ? "" : f.ghost}
      mid={f.mid}
      sufGhost={f.atEnd ? f.ghost : ""}
      suf={f.atEnd ? f.locked : ""}
      solid={f.done}
    />
  );
}
