import {
  ArrowUpRight,
  Clipboard,
  Clock3,
  Coins,
  ExternalLink,
  Gauge,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AssayScoreRing } from '../components/AssayScoreRing';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';
import { SkeletonCard, SkeletonLine, SkeletonScoreRing } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { useWallet } from '../contexts/WalletContext';
import { fetchAgentTransactions, fetchIndexedAgent } from '../lib/api';
import { hydrateAgent } from '../lib/agent';
import { fetchAgentStats, fetchOnChainAgent, fetchOnChainScore } from '../lib/contracts';
import { formatDateTime, formatPercent, formatUsdc, formatUsdcCompact, truncateAddress } from '../lib/format';

export function AgentProfilePage() {
  const { address } = useParams();
  const { readProvider } = useWallet();
  const [agent, setAgent] = useState(null);
  const [agentStats, setAgentStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadAgent() {
      setIsLoading(true);
      setError('');

      try {
        const [indexedAgent, onChainAgent, onChainScore, onChainStats] = await Promise.all([
          fetchIndexedAgent(address).catch((requestError) => {
            if (requestError.message.includes('not found')) {
              return null;
            }
            throw requestError;
          }),
          fetchOnChainAgent(readProvider, address).catch(() => null),
          fetchOnChainScore(readProvider, address).catch(() => null),
          fetchAgentStats(readProvider, address).catch(() => null),
        ]);

        if (!indexedAgent && !onChainAgent) {
          throw new Error('Agent not found in the discovery engine or the on-chain registry.');
        }

        const indexedMetadata = indexedAgent?.agent ?? null;
        const indexedScore = indexedMetadata?.assayScore ?? 0;
        const mergedScore =
          onChainScore != null && (indexedScore === 0 || onChainScore > indexedScore)
            ? onChainScore
            : indexedScore;
        const hydrated = hydrateAgent(
          indexedMetadata
            ? { ...indexedMetadata, assayScore: mergedScore }
            : { address, assayScore: mergedScore },
          onChainAgent ?? {},
          onChainStats,
        );
        let ledger = [];
        try {
          const txs = await fetchAgentTransactions(address);
          ledger = txs
            .map((tx) => {
              try {
                return {
                  hash: tx.txHash,
                  method: tx.method,
                  label: tx.label,
                  status: 'Confirmed',
                  amount: tx.amount,
                  amountLabel: tx.amount && tx.amount !== '0' ? formatUsdc(BigInt(tx.amount)) : 'Metadata',
                  timestampLabel: tx.timestamp ? formatDateTime(tx.timestamp) : 'Pending',
                  escrowId: tx.escrowId || null,
                  blockNumber: 0,
                };
              } catch (itemError) {
                console.warn('Skipping malformed ledger row:', itemError);
                return null;
              }
            })
            .filter(Boolean);
        } catch (e) {
          console.warn('Ledger fetch failed:', e);
        }

        if (!ignore) {
          setAgent(hydrated);
          setHistory(ledger);
          setAgentStats(onChainStats);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message);
          setAgent(null);
          setAgentStats(null);
          setHistory([]);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadAgent();

    return () => {
      ignore = true;
    };
  }, [address, readProvider]);

  async function handleCopyAddress() {
    if (!agent?.address || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(agent.address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-4">
          <SkeletonLine width="w-1/3" height="h-8" />
          <SkeletonLine width="w-1/2" />
        </div>

        <section className="grid gap-6 lg:grid-cols-4">
          <article className="panel rounded-[32px] p-6 md:col-span-2">
            <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div className="space-y-4">
                <SkeletonLine width="w-1/3" />
                <SkeletonLine width="w-1/4" height="h-12" />
                <SkeletonLine width="w-2/3" />
              </div>
              <SkeletonScoreRing />
            </div>
          </article>
          <SkeletonCard />
          <SkeletonCard />
        </section>
      </div>
    );
  }

  if (!agent) {
    return (
      <EmptyState
        title="Agent profile unavailable"
        description={error || 'The requested profile could not be resolved from the local index or registry.'}
        action={
          <Link
            to="/"
            className="rounded-2xl border border-primary/20 px-5 py-3 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/8"
          >
            Return to Discover
          </Link>
        }
      />
    );
  }

  const completionRateLabel = agent.completionRate == null ? 'No transactions yet' : formatPercent(agent.completionRate);
  const avgSpeedLabel = agent.avgSpeedMs == null ? 'No transactions yet' : `${agent.avgSpeedMs} ms`;
  const avgSpeedWidth = agent.avgSpeedMs == null ? 0 : Math.max(24, 100 - agent.avgSpeedMs / 2);
  const hasReliabilityStreak = agent.reliabilityStreak != null && agent.reliabilityStreak > 0;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Agent"
        title={agent.name}
        description="On-chain registration data and verified transaction history."
      />

      {error ? <div className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
        <article className="panel rounded-[32px] p-6 md:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[28px] border border-primary/18 bg-primary/10 shadow-glow">
              <div className="font-display text-4xl font-bold tracking-[-0.08em] text-primary">
                {(agent.name.match(/[A-Z]/g) ?? agent.name.slice(0, 2).toUpperCase().split('')).slice(0, 2).join('')}
              </div>
            </div>

            <div className="flex-1">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <StatusBadge status={agent.status} />
                    <div className="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">
                      Indexed Profile
                    </div>
                  </div>
                  <h1 className="font-display text-4xl font-bold tracking-[-0.08em] text-text md:text-5xl">
                    {agent.name}
                  </h1>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300/72">
                    <span className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 font-mono text-primary">
                      {truncateAddress(agent.address, 8, 6)}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/8 px-3 py-2 transition hover:border-primary/30 hover:bg-primary/8"
                    >
                      <Clipboard size={15} />
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>                <div className="flex flex-col gap-3">
                  <Link
                    to={`/escrow/create/${agent.address}`}
                    className="group relative inline-flex items-center justify-center gap-2 rounded-2xl electric-button px-5 py-4 text-sm font-semibold uppercase tracking-[0.26em] transition hover:brightness-110"
                  >
                    Create Escrow
                    <ArrowUpRight size={16} />
                  </Link>
                  <div className="rounded-2xl border border-primary/12 bg-primary/8 px-4 py-3 text-xs leading-6 text-slate-300/76">
                    On-chain earnings and stake pull directly from the deployed registry when MetaMask is available.
                  </div>
                </div>
              </div>

              <p className="mt-6 max-w-3xl text-sm leading-7 text-slate-300/80">{agent.capability}</p>

              <div className="mt-6 flex flex-wrap gap-2">
                {agent.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/6 bg-white/4 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="panel rounded-[32px] p-6 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Governance & Liquidity</div>
          <div className="mt-8 space-y-6">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">Total Stake</div>
              <div className="mt-2 font-display text-4xl font-bold tracking-[-0.08em] text-text">
                {formatUsdcCompact(agent.stake)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">Total Earnings</div>
              <div className="mt-2 font-display text-4xl font-bold tracking-[-0.08em] text-text">
                {formatUsdc(agent.totalEarnings)}
              </div>
            </div>
            <div className="rounded-2xl border border-white/6 bg-white/4 p-4 text-sm leading-7 text-slate-300/78">
              Live data from Base Sepolia testnet.
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-4">
        <article className="panel rounded-[32px] p-6 md:col-span-2">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.32em] text-muted">Assay Score</div>
              <div className="mt-4 font-display text-5xl font-bold tracking-[-0.1em] text-primary">
                {Math.round(agent.assayScore / 10).toLocaleString()}
              </div>
              <div className="mt-3 max-w-xs text-sm leading-7 text-slate-300/74">
                {agent.assayScore === 0 && agentStats
                  ? agentStats.totalJobs === 0
                    ? 'No verified transactions recorded on-chain yet.'
                    : `${agentStats.completedJobs}/3 verified — score unlocks after 3 completed transactions.`
                  : 'Computed from verified on-chain transaction history.'}
              </div>
            </div>
            <AssayScoreRing value={agent.assayScore} />
          </div>
        </article>

        <article className="panel rounded-[32px] p-6">
          <div className="mb-5 flex items-center gap-3">
            <ShieldCheck size={18} className="text-primary" />
            <div className="text-xs font-semibold uppercase tracking-[0.32em] text-muted">Execution Quality</div>
          </div>
          <div className="space-y-5">
            <MetricBar label="Completion Rate" value={completionRateLabel} width={agent.completionRate ?? 0} />
            <MetricBar label="Avg Speed" value={avgSpeedLabel} width={avgSpeedWidth} />
          </div>
        </article>

        <article className="panel rounded-[32px] p-6">
          <div className="mb-5 flex items-center gap-3">
            <Sparkles size={18} className="text-primary" />
            <div className="text-xs font-semibold uppercase tracking-[0.32em] text-muted">Reliability Streak</div>
          </div>
          <div className="font-display text-4xl font-bold tracking-[-0.08em] text-text">
            {hasReliabilityStreak ? (
              <>
                {agent.reliabilityStreak}
                <span className="ml-2 text-sm font-semibold uppercase tracking-[0.28em] text-muted">epochs</span>
              </>
            ) : (
              'N/A'
            )}
          </div>
          {hasReliabilityStreak ? (
            <div className="mt-5 flex gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-8 flex-1 rounded-xl bg-electric-blue"
                  style={{ opacity: 0.22 + index * 0.12 }}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 text-sm leading-7 text-slate-400">Appears after verified transactions.</div>
          )}
        </article>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Wallet} label="Registry Address" value={truncateAddress(agent.address, 8, 6)} helper="Connected wallet identity" />
        <SummaryCard icon={Gauge} label="Avg Speed" value={avgSpeedLabel} helper="Execution timing appears after completed activity" />
        <SummaryCard icon={Clock3} label="Completion Rate" value={completionRateLabel} helper="Visible once the agent has transaction history" />
        <SummaryCard icon={Coins} label="Stake Weight" value={formatUsdc(agent.stake)} helper="Protocol collateral depth" />
      </section>

      <section className="panel overflow-hidden rounded-[32px]">
        <div className="flex flex-col gap-3 border-b border-white/6 bg-white/3 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Transaction Ledger</div>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.06em] text-text">Transaction History</h2>
          </div>
          <div className="text-sm text-slate-300/72">Verified on-chain activity</div>
        </div>

        {history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/6 bg-background/70 text-[10px] font-semibold uppercase tracking-[0.32em] text-muted">
                  <th className="px-6 py-4">Transaction ID</th>
                  <th className="px-6 py-4">Method</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4 text-right">Explorer</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 8).map((row) => (
                  <tr key={`${row.hash}-${row.method}`} className="border-b border-white/5 text-sm text-slate-200/88">
                    <td className="px-6 py-4 font-mono text-primary">{truncateAddress(row.hash, 10, 6)}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-text">{row.method}</div>
                      <div className="text-xs text-muted">{row.label}</div>
                      {row.escrowId ? (
                        <Link to={`/escrow/${row.escrowId}`} className="text-xs text-primary hover:underline">
                          View Escrow →
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full border border-success/25 bg-success/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-success">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">{row.amountLabel}</td>
                    <td className="px-6 py-4 text-slate-300/74">{row.timestampLabel}</td>
                    <td className="px-6 py-4 text-right">
                      <a
                        href={`https://sepolia.basescan.org/tx/${row.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-primary transition hover:text-sky-200"
                      >
                        Open
                        <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-10 text-sm leading-7 text-slate-300/74">
            No transactions yet.
          </div>
        )}
      </section>
    </div>
  );
}

function MetricBar({ label, value, width }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-slate-300/78">
        <span>{label}</span>
        <span className="font-semibold text-text">{value}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/6">
        <div className="h-full rounded-full bg-electric-blue" style={{ width: `${Math.min(width, 100)}%` }} />
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, helper }) {
  return (
    <article className="panel rounded-[28px] p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon size={18} />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted">{label}</div>
      </div>
      <div className="mt-5 font-display text-2xl font-bold tracking-[-0.06em] text-text">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-300/68">{helper}</div>
    </article>
  );
}
