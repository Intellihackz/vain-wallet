import Link from "next/link";
import Logo from "./Logo";

export default function Header() {
  return (
    <header className="flex h-16 items-center justify-between">
      <Link href="/" aria-label="Vain Wallet home">
        <Logo />
      </Link>
      <Link href="/generate" className="btn !h-9 !px-4 text-sm">Generate</Link>
    </header>
  );
}
