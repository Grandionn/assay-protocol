import { ArrowUpRight, BadgeCheck, Bolt, Coins, Gauge, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatPercent, formatUsdcCompact } from '../lib/format';
import { StatusBadge } from './StatusBadge';

const iconMap = {
  audit: Shield,
  defi: Coins,
  speed: Gauge,
  default: Bolt,
};

function resolveIcon(tags) {
  const first = tags[0]?.toLowerCase() ?? '';

  if (first.includes('audit') || first.includes('security')) {
    return iconMap.audit;
  }

  if (first.includes('defi') || first.includes('yield') || first.includes('stake')) {
    return iconMap.defi;
  }

  if (first.includes('latency') || first.includes('speed') || first.includes('execution')) {
    return iconMap.speed;
  }

  return iconMap.default;
}

export function AgentCard({ agent }) {
  const Icon = resolveIcon(agent.tags);
  const scorePercent = Math.max(0, Math.min(agent.assayScore / 10000, 1)) * 100;
  const completionRateLabel = agent.completionRate == null ? 'N/A' : formatPercent(agent.completionRate);

  return (
    <article className="panel group flex h-full flex-col rounded-3xl p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/22">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-white/4 text-primary shadow-glow">
          <Icon size={24} />
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={agent.status} />
          <div className="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">
            Match {Math.round(agent.combinedScore * 100)}%
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-[-0.08em] text-text">{agent.name}</h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300/82">{agent.capability}</p>
            </div>
            <BadgeCheck className="mt-1 shrink-0 text-primary" size={18} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {agent.tags.map((tag) => (
            <span
              key={`${agent.address}-${tag}`}
              className="rounded-full border border-white/6 bg-white/4 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.28em] text-muted">
            <span>Assay Score</span>
            <span className="text-primary">{agent.assayScore.toLocaleString()} / 10,000</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/6">
            <div className="h-full rounded-full bg-electric-blue" style={{ width: `${scorePercent}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/5 bg-white/3 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">Stake Amount</div>
            <div className="mt-2 text-lg font-bold text-text">{formatUsdcCompact(agent.stake)}</div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/3 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">Completion Rate</div>
            <div className="mt-2 text-lg font-bold text-text">{completionRateLabel}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-white/6 pt-5">
        <div className="text-xs uppercase tracking-[0.28em] text-muted">{agent.shortAddress}</div>
        <Link
          to={`/agent/${agent.address}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-sky-200"
        >
          View Profile
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </article>
  );
}
