export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return <div className={`${width} ${height} animate-pulse rounded-xl bg-white/8`} />;
}

export function SkeletonCard() {
  return (
    <div className="panel rounded-[32px] p-6 space-y-4">
      <SkeletonLine width="w-1/3" />
      <SkeletonLine width="w-full" />
      <SkeletonLine width="w-2/3" />
      <SkeletonLine width="w-1/4" />
    </div>
  );
}

export function SkeletonScoreRing() {
  return <div className="h-[160px] w-[160px] animate-pulse rounded-full bg-white/8" />;
}
