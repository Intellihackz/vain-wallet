import Link from "next/link";
import PatternPreview from "@/components/PatternPreview";

const facts = [
  "EVM and Solana wallets",
  "Keys never leave your browser",
  "Free, no account, no wallet connect",
];

const steps = [
  ["Choose", "How your address begins, how it ends, or both. Pick EVM or Solana."],
  ["Wait", "Your browser tries random keys on every core until one fits. Nothing is uploaded."],
  ["Import", "Copy the private key into your wallet. An EVM address works on every EVM chain."],
];

const faq = [
  ["Can you see my key?", "No. Generation runs in your browser with its secure random source. There is no server in the loop."],
  ["Is a vanity address less secure?", "No. Only the part you choose is fixed. The rest is random, and the key is a full 256 bits."],
  ["Which letters can I use?", "On EVM, hex only: 0-9 and a-f. That still spells dead, cafe and face, and digits stand in for letters, like c0de. On Solana, any letter or digit except 0, O, I and l, and upper and lower case are different."],
  ["How long does it take?", "EVM: each extra character is 16 times harder, so four take a second and eight a couple of hours. Solana: each one is about 58 times harder, so three are instant, four take about half a minute and five about half an hour. Ignoring case makes Solana faster."],
];

export default function Home() {
  return (
    <>
      <section className="pt-14 text-center sm:pt-24">
        <h1 className="mx-auto max-w-4xl text-[clamp(44px,8vw,96px)] font-medium leading-[0.98] tracking-[-0.05em]">
          Be vain about your address.
        </h1>
        <p className="mx-auto mt-6 max-w-md text-lg text-muted">
          Choose how your wallet address starts and ends. Ground in your browser, for free.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/generate" className="btn">Generate wallet</Link>
          <a href="#how" className="btn btn-light">How it works</a>
        </div>

        <div className="relative mt-14 sm:mt-20">
          <div className="bloom pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[min(1100px,130%)] -translate-x-1/2 -translate-y-1/2" />
          <div className="relative px-2">
            <PatternPreview />
          </div>
        </div>
      </section>

      <ul className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-3 sm:mt-28">
        {facts.map((f) => (
          <li key={f} className="bg-paper px-6 py-5 text-center text-[15px]">{f}</li>
        ))}
      </ul>

      <section id="how" className="scroll-mt-8 pt-28">
        <h2 className="text-3xl font-medium tracking-[-0.04em] sm:text-4xl">How it works</h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {steps.map(([t, d], i) => (
            <li key={t}>
              <span className="font-mono text-sm text-muted">0{i + 1}</span>
              <h3 className="mt-2 text-lg font-medium">{t}</h3>
              <p className="mt-1 text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="pt-24">
        <h2 className="text-3xl font-medium tracking-[-0.04em] sm:text-4xl">Questions</h2>
        <div className="mt-6">
          {faq.map(([q, a]) => (
            <details key={q} className="group border-t border-rule py-5 last:border-b">
              <summary className="flex cursor-pointer list-none items-center justify-between text-lg">
                {q}
                <span className="font-mono text-muted transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
