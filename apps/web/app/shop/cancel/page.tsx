"use client";

import Link from "next/link";
import { Button } from "@/components/button";
import { PageContent } from "@/components/page-content";

export default function ShopCancelPage() {
  return (
    <PageContent size="md" className="max-w-3xl text-center">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">Payment Cancelled</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Checkout cancelled</h1>
      <p className="mt-3 text-sm text-slate-300">No charges were made. You can try again anytime.</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/profile">
          <Button className="w-full sm:w-auto">Back to Profile</Button>
        </Link>
        <Link href="/play">
          <Button variant="secondary" className="w-full sm:w-auto">
            Play
          </Button>
        </Link>
      </div>
    </PageContent>
  );
}
