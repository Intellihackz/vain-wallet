import { Suspense } from "react";
import Grinder from "@/components/Grinder";

export const metadata = { title: "Generate · Vain Wallet" };

async function FromQuery({ searchParams }: { searchParams: PageProps<"/generate">["searchParams"] }) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 8) : "");
  return <Grinder initialPrefix={pick("prefix")} initialSuffix={pick("suffix")} initialChain={sp.chain === "sol" ? "sol" : "evm"} />;
}

export default function Generate({ searchParams }: PageProps<"/generate">) {
  return (
    <div className="pt-10 sm:pt-16">
      <Suspense fallback={<Grinder />}>
        <FromQuery searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
