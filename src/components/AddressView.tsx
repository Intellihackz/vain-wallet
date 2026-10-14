/** One big address line. Matched characters sit in a black "etched" tag, the rest is grey. */
export default function AddressView({
  pre = "",
  preGhost = "",
  mid,
  suf = "",
  sufGhost = "",
  solid = false,
  className = "",
  ...rest
}: {
  pre?: string;
  preGhost?: string;
  mid: string;
  suf?: string;
  sufGhost?: string;
  solid?: boolean;
  className?: string;
  "aria-hidden"?: boolean;
}) {
  const tag = "rounded-[0.18em] bg-ink px-[0.12em] text-white";
  return (
    <div {...rest} className={`break-all text-center font-mono leading-[1.5] ${className}`}>
      <span className="text-ink/25">0x</span>
      {pre && <span className={tag}>{pre}</span>}
      {preGhost && <span className="text-ink/35">{preGhost}</span>}
      <span className={solid ? "text-ink" : "text-ink/35"}>{mid}</span>
      {sufGhost && <span className="text-ink/35">{sufGhost}</span>}
      {suf && <span className={tag}>{suf}</span>}
    </div>
  );
}
