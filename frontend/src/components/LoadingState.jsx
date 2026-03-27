export function LoadingState({ label = 'Loading' }) {
  return (
    <div className="panel rounded-3xl p-8">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-primary/15" />
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.32em] text-primary">{label}</div>
          <div className="mt-2 h-3 w-48 animate-pulse rounded-full bg-white/8" />
        </div>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-3xl border border-white/5 bg-white/3" />
        ))}
      </div>
    </div>
  );
}
