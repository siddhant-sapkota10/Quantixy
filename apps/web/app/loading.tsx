export default function Loading() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6 text-white">
      <div className="q-card-strong w-full max-w-sm rounded-[2rem] p-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-500/10 text-3xl font-black text-sky-100">
          #
        </div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.32em] text-sky-200">Quantixy</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight">Loading arena</h1>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-sky-300 via-amber-300 to-violet-300" />
        </div>
      </div>
    </main>
  );
}
