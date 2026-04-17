import Link from "next/link";
import { Button } from "@/components/button";
import { PageContent } from "@/components/page-content";

export default function ShopSuccessPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams?.session_id;
  const sessionId = Array.isArray(raw) ? raw[0] : raw;

  return (
    <PageContent size="md" className="max-w-3xl text-center">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">Payment Success</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Purchase complete</h1>
      <p className="mt-3 text-sm text-slate-300">
        Your purchase will unlock as soon as payment is confirmed. (This is done via Stripe webhook.)
      </p>
      {sessionId ? (
        <p className="mt-3 text-[11px] text-slate-500">
          Session: <code className="rounded bg-slate-900 px-2 py-1">{sessionId}</code>
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/profile">
          <Button className="w-full sm:w-auto">Go to Profile</Button>
        </Link>
        <Link href="/play">
          <Button variant="secondary" className="w-full sm:w-auto">
            Play a Match
          </Button>
        </Link>
      </div>
    </PageContent>
  );
}
