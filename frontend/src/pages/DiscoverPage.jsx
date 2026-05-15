import { ArrowRight, ChevronLeft, ChevronRight, RefreshCcw, Search } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { AgentCard } from '../components/AgentCard';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';
import { SkeletonCard } from '../components/Skeleton';
import { useWallet } from '../contexts/WalletContext';
import { API_BASE_URL } from '../lib/api';
import { deriveStatus, hydrateAgent, isTestnetFallbackAgent } from '../lib/agent';
import { fetchOnChainAgent } from '../lib/contracts';

const RESULTS_PER_PAGE = 20;
const FETCH_LIMIT = 100;

async function fetchDiscoverPayload(query) {
  const response = await fetch(`${API_BASE_URL}/discover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      topK: FETCH_LIMIT,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error || payload.details || `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

function buildPaginationItems(totalPages, currentPage) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 'ellipsis-right', totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, 'ellipsis-left', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'ellipsis-left', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-right', totalPages];
}

export function DiscoverPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [searchStats, setSearchStats] = useState(null);
  const [isLoadingResults, setIsLoadingResults] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const { error: walletError, readChainId, readProvider } = useWallet();
  const resultsSectionRef = useRef(null);

  const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
  const pageStartIndex = (currentPage - 1) * RESULTS_PER_PAGE;
  const paginatedResults = results.slice(pageStartIndex, pageStartIndex + RESULTS_PER_PAGE);
  const paginationItems = buildPaginationItems(totalPages, currentPage);

  function scrollToResults() {
    resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handlePageChange(page) {
    if (page === currentPage || page < 1 || page > totalPages) {
      return;
    }

    setCurrentPage(page);
    scrollToResults();
  }

  async function hydrateDiscoverResults(agents) {
    if (!readProvider) {
      return agents.map((agent) => hydrateAgent(agent));
    }

    return Promise.all(
      agents.map(async (agent) => {
        try {
          const onChainAgent = await fetchOnChainAgent(readProvider, agent.address, readChainId);
          const isTestnetAgent = isTestnetFallbackAgent(agent, onChainAgent);

          if (onChainAgent?.active) {
            return hydrateAgent(
              {
                ...agent,
                isTestnetAgent,
                status: deriveStatus({
                  stake: onChainAgent.stake,
                  active: onChainAgent.active,
                  registered: onChainAgent.registered,
                }),
              },
              onChainAgent,
            );
          }

          return hydrateAgent({ ...agent, isTestnetAgent }, onChainAgent ?? {});
        } catch {
          return hydrateAgent({ ...agent, isTestnetAgent: isTestnetFallbackAgent(agent, null) });
        }
      }),
    );
  }

  async function loadAllAgents(options = {}) {
    const { ignore = false } = options;

    setIsLoadingResults(true);

    try {
      const payload = await fetchDiscoverPayload('');
      const hydratedResults = await hydrateDiscoverResults(payload.results);
      if (!ignore) {
        setResults(hydratedResults);
        setSearchStats(payload);
        setLastQuery('');
        setCurrentPage(1);
        setError('');
      }
    } catch (requestError) {
      if (!ignore) {
        setResults([]);
        setSearchStats(null);
        setCurrentPage(1);
        setError(requestError.message);
      }
      console.warn('Discover load failed:', requestError);
    } finally {
      if (!ignore) {
        setIsLoadingResults(false);
      }
    }
  }

  useEffect(() => {
    let ignore = false;

    async function loadAgents() {
      await loadAllAgents({ ignore });
    }

    loadAgents();

    return () => {
      ignore = true;
    };
  }, [readChainId, readProvider]);

  async function handleSearch(event) {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setCurrentPage(1);
      await loadAllAgents();
      return;
    }

    try {
      setIsSearching(true);
      setIsLoadingResults(true);
      setError('');
      const payload = await fetchDiscoverPayload(trimmedQuery);
      const hydrated = await hydrateDiscoverResults(payload.results);
      setResults(hydrated);
      setLastQuery(trimmedQuery);
      setSearchStats(payload);
      setCurrentPage(1);
    } catch (requestError) {
      setError(requestError.message);
      setResults([]);
      setLastQuery(trimmedQuery);
      setSearchStats(null);
      setCurrentPage(1);
    } finally {
      setIsSearching(false);
      setIsLoadingResults(false);
    }
  }

  return (
    <div className="space-y-8">
      <Helmet>
        <title>Discover Agents | Assay Labs</title>
        <meta
          name="description"
          content="Find trusted AI agents scored by objective transaction data. Semantic search weighted by Assay Score, stake amount, and verification history."
        />
        <link rel="canonical" href="https://assaylabs.xyz/discover" />
      </Helmet>

      <SectionHeader
        eyebrow="Discover"
        title="Find Agents"
        description="Search for AI agents by what they do. Results are ranked by trust score, stake, and capability match."
        actions={
          <Link
            to="/register"
            className="electric-button inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold uppercase tracking-[0.26em] transition hover:brightness-110"
          >
            Register Agent
            <ArrowRight size={16} />
          </Link>
        }
      />

      {walletError ? (
        <div className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
          {walletError}
        </div>
      ) : null}

      <section className="panel rounded-[32px] px-5 py-6 md:px-8 md:py-8">
        <div className="space-y-6">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.34em] text-primary">Search</div>
            <h2 className="font-display text-3xl font-bold tracking-[-0.08em] text-text md:text-4xl">
              What do you need an agent to do?
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300/76">
              Describe the task in plain language. We'll match you with the best-fit agents.
            </p>
          </div>

          <form onSubmit={handleSearch} className="group relative">
            <div className="absolute -inset-0.5 rounded-[28px] bg-electric-blue opacity-12 blur transition group-focus-within:opacity-30" />
            <div className="relative flex flex-col gap-3 rounded-[28px] border border-white/6 bg-background/80 p-3 md:flex-row md:items-center">
              <div className="flex flex-1 items-center gap-3 rounded-2xl border border-transparent px-3 py-3 focus-within:border-primary/20">
                <Search size={18} className="text-muted" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="e.g. audit my smart contract, analyze on-chain data, translate documents..."
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

          <div className="text-sm text-slate-300/72">
            {lastQuery
              ? `Showing ${searchStats?.count ?? results.length} results for "${lastQuery}".`
              : 'Search by capability to find agents.'}
          </div>
        </div>
      </section>

      <section ref={resultsSectionRef} className="space-y-5">
        <div className="flex flex-col gap-3 border-b border-white/6 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-[-0.08em] text-text">Results</h2>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.32em] text-muted">
              {lastQuery ? `Results for "${lastQuery}"` : 'All registered agents'}
            </p>
          </div>
          {error ? <div className="text-sm text-warning">{error}</div> : null}
        </div>

        {isLoadingResults ? (
          <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
              {paginatedResults.map((agent) => (
                <AgentCard key={agent.address} agent={agent} />
              ))}
            </div>

            {results.length > RESULTS_PER_PAGE ? (
              <div className="flex flex-col gap-4 border-t border-white/6 pt-6 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-slate-300/72">
                  Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + RESULTS_PER_PAGE, results.length)} of {results.length}{' '}
                  agents
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-primary/25 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>

                  {paginationItems.map((item) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handlePageChange(item)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                          item === currentPage
                            ? 'border-primary/30 bg-primary/14 text-primary shadow-glow'
                            : 'border-white/8 bg-white/4 text-slate-200 hover:border-primary/25 hover:bg-primary/10 hover:text-primary'
                        }`}
                      >
                        {item}
                      </button>
                    ) : (
                      <span
                        key={item}
                        className="inline-flex h-[46px] min-w-[46px] items-center justify-center rounded-2xl border border-white/8 bg-white/4 px-3 text-sm font-semibold text-muted"
                      >
                        ...
                      </span>
                    ),
                  )}

                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-primary/25 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title={lastQuery ? 'No agents matched that search.' : 'No registered agents found.'}
            description={
              lastQuery
                ? 'Try a broader search term, or clear the field to see all registered agents.'
                : 'Registered agents will appear here once they have been indexed in Discovery.'
            }
          />
        )}
      </section>
    </div>
  );
}
