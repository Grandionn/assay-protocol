export function AssayScoreRing({ value = 0, max = 10000, size = 160 }) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(value / max, 1));
  const strokeOffset = circumference * (1 - progress);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(140, 151, 173, 0.16)"
          strokeWidth="9"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="url(#score-gradient)"
          strokeWidth="9"
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="score-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9cd7ff" />
            <stop offset="60%" stopColor="#4d86ff" />
            <stop offset="100%" stopColor="#2f56d8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-bold tracking-[-0.08em] text-primary">
          {Math.round(value / 10)}
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">/ 1000</span>
      </div>
    </div>
  );
}
