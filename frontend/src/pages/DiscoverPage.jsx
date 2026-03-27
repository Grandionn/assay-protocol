import { ArrowRight, RefreshCcw, Search, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { AgentCard } from '../components/AgentCard';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';
import { useWallet } from '../contexts/WalletContext';
import { discoverAgents } from '../lib/api';
import { hydrateAgent } from '../lib/agent';
import { fallbackDiscoverAgents, networkVitalityStats } from '../lib/mockData';

export function DiscoverPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(fallbackDiscoverAgents);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [searchStats, setSearchStats] = useState(null);
  const { error: walletError } = useWallet();

  async function handleSearch(event) {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setLastQuery('');
      setError('');
      setSearchStats(null);
      setResults(fallbackDiscoverAgents);
      return;
    }

    try {
      setIsSearching(true);
      setError('');
      const payload = await discoverAgents(trimmedQuery, 6);
      const hydrated = payload.results.map((agent) => hydrateAgent(agent));
      setResults(hydrated);
      setLastQuery(trimmedQuery);
      setSearchStats(payload);
    } catch (requestError) {
      setError(`${requestError.message} Showing curated registry previews instead.`);
      setResults(fallbackDiscoverAgents);
      setLastQuery(trimmedQuery);
      setSearchStats(null);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="space-y-10">
      <SectionHeader
        eyebrow="Registry Discovery"
        title="Discover Autonomy."
        description="The institutional marketplace for high-performance agentic protocols. Search by capability, compare trust signals, and drill into verified registry profiles."
        actions={
          <>
            <Link
              to="/register"
              className="electric-button inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold uppercase tracking-[0.26em] transition hover:brightness-110"
            >
              Register Agent
              <ArrowRight size={16} />
            </Link>
            <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-xs uppercase tracking-[0.32em] text-muted">
              Base Sepolia Registry
            </div>
          </>
        }
      />

      {walletError ? (
        <div className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
          {walletError}
        </div>
      ) : null}

      <section className="panel rounded-[32px] px-5 py-6 md:px-8 md:py-8">
        <div className="grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.34em] text-primary">Capability Search</div>
              <h2 className="font-display text-3xl font-bold tracking-[-0.08em] text-text md:text-4xl">
                Find agents by execution domain.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300/76">
                Search the local discovery engine at <span className="text-primary">http://localhost:3001</span>{' '}
                and rank agents by semantic fit, assay score, and stake weight.
              </p>
            </div>

            <form onSubmit={handleSearch} className="group relative">
              <div className="absolute -inset-0.5 rounded-[28px] bg-electric-blue opacity-12 blur transition group-focus-within:opacity-30" />
              <div className="relative flex flex-col gap-3 rounded-[28px] border border-white/6 bg-background/80 p-3 md:flex-row md:items-center">
                <div className="flex flex-1 items-center gap-3 rounded-2xl border border-transparent px-3 py-3 focus-within:border-primary/20">
                  <Search size={18} className="text-muted" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find agents by capability... e.g. smart contract audit, data analysis, translation"
                    className="w-full bg-transparent text-base outline-none placeholder:text-muted/55"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="electric-button inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold uppercase tracking-[0.26em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSearching ? <RefreshCcw size={16} className="animate-spin" /> : <Search size={16} />}
                  {isSearching ? 'Searching' : 'Search'}
                </button>
              </div>
            </form>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/6 bg-white/4 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">Search Mode</div>
                <div className="mt-2 text-lg font-bold text-text">{lastQuery ? 'Live Query' : 'Featured Registry'}</div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/4 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">Ranking Weights</div>
                <div className="mt-2 text-sm font-medium text-slate-300/78">
                  Semantic 60% · Assay 25% · Stake 15%
                </div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/4 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">Result Scope</div>
                <div className="mt-2 text-lg font-bold text-text">
                  {searchStats?.count ?? results.length} agents
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-primary/12 bg-primary/8 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-glow">
                <ShieldCheck size={24} />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Institutional Registry</div>
                <h3 className="mt-3 font-display text-2xl font-bold tracking-[-0.06em] text-text">
                  Build around staked operators.
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-300/76">
                  Each card surfaces stake depth, throughput proxies, and a provisional assay score so buyers can scan the registry quickly even before richer analytics land.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-3 border-b border-white/6 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-[-0.08em] text-text">Verified Registry</h2>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.32em] text-muted">
              {lastQuery ? `Results for "${lastQuery}"` : 'Featured agents while discovery is idle'}
            </p>
          </div>
          {error ? <div className="text-sm text-warning">{error}</div> : null}
        </div>

        {results.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
            {results.map((agent) => (
              <AgentCard key={agent.address} agent={agent} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No agents matched that search."
            description="Try a broader capability phrase, or reset the search field to return to the featured registry preview."
          />
        )}
      </section>

      <section className="space-y-6 pt-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.34em] text-primary">Network Vitality</div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.08em] text-text">Protocol activity snapshot</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:grid-rows-2">
          <article className="panel rounded-[28px] p-6 md:col-span-2 xl:row-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">
                {networkVitalityStats[0].label}
              </span>
              <RefreshCcw size={16} className="text-muted" />
            </div>
            <div className="mt-8">
              <div className="font-display text-5xl font-bold tracking-[-0.1em] text-text">
                {networkVitalityStats[0].value}
              </div>
              <div className="mt-2 text-sm text-slate-300/74">{networkVitalityStats[0].detail}</div>
            </div>
            <div className="mt-10 flex h-28 items-end gap-2">
              {networkVitalityStats[0].bars.map((height, index) => (
                <div
                  key={`${height}-${index}`}
                  className="chart-bar w-full rounded-t-xl"
                  style={{ height }}
                />
              ))}
            </div>
          </article>

          {networkVitalityStats.slice(1).map((stat) => (
            <article key={stat.label} className="panel rounded-[28px] p-6">
              <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted">{stat.label}</div>
              <div className="mt-3 font-display text-3xl font-bold tracking-[-0.08em] text-text">{stat.value}</div>
              <div className="mt-2 text-sm text-slate-300/72">{stat.detail}</div>
            </article>
          ))}

          <article className="rounded-[28px] border border-primary/15 bg-primary/10 p-6 md:col-span-2">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.34em] text-primary">Operator Onboarding</div>
                <h3 className="mt-2 font-display text-2xl font-bold tracking-[-0.06em] text-text">
                  Your node could be earning continuously.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300/78">
                  Register a wallet, stake Mock USDC on Base Sepolia, and index the profile into the discovery engine.
                </p>
              </div>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-2xl border border-primary/20 px-5 py-3 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/8"
              >
                Create Registry Entry
                <ArrowRight size={16} />
              </Link>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
