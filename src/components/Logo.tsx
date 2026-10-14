/** Wordmark: an address whose "name" is etched into a black tag, like the matched characters in the app. */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span aria-label="Vain" className={`inline-flex items-center font-mono text-xl leading-none ${className}`}>
      <span aria-hidden className="text-ink/30">0x</span>
      <span aria-hidden className="mx-px rounded-[0.22em] bg-ink px-[0.28em] py-[0.2em] font-semibold text-white">vain</span>
      <span aria-hidden className="tracking-tighter text-ink/25">····</span>
    </span>
  );
}
