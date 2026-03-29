import { CalendarClock, Coins, FileText, LoaderCircle, ShieldCheck, Wallet } from 'lucide-react';
import { ethers } from 'ethers';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AssayScoreRing } from '../components/AssayScoreRing';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useWallet } from '../contexts/WalletContext';
import { fetchIndexedAgent } from '../lib/api';
import { hydrateAgent } from '../lib/agent';
import { createAndFundEscrow, fetchOnChainAgent, parseWalletError } from '../lib/contracts';
import { formatDateTime, formatUsdc, formatUsdcCompact, truncateAddress } from '../lib/format';

export function CreateEscrowPage() {
  const { agentAddress } = useParams();
  const {
    address: walletAddress,
    connectWallet,
    error: walletError,
    hasWallet,
    isConnecting,
    isWrongNetwork,
    readProvider,
    signer,
    switchToBaseSepolia,
  } = useWallet();

  const [agent, setAgent] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdEscrowId, setCreatedEscrowId] = useState('');
  const [status, setStatus] = useState({ tone: '', message: '' });
  const [form, setForm] = useState({
    paymentAmount: '100',
    specText: '',
    deadline: buildDefaultDeadlineInput(),
  });

  useEffect(() => {
    let ignore = false;

    async function loadAgent() {
      setIsLoading(true);
      setError('');

      try {
        const [indexedAgent, onChainAgent] = await Promise.all([
          fetchIndexedAgent(agentAddress).catch((requestError) => {
            if (requestError.message.includes('not found')) {
              return null;
            }
            throw requestError;
          }),
          fetchOnChainAgent(readProvider, agentAddress).catch(() => null),
        ]);

        if (!indexedAgent && !onChainAgent) {
          throw new Error('The selected agent could not be resolved from the discovery index or registry.');
        }

        if (!ignore) {
          setAgent(hydrateAgent(indexedAgent?.agent ?? { address: agentAddress }, onChainAgent ?? {}));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message);
          setAgent(null);
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
  }, [agentAddress, readProvider]);

  const specHashPreview = useMemo(() => {
    const source = form.specText.trim();
    return source ? ethers.keccak256(ethers.toUtf8Bytes(source)) : ethers.ZeroHash;
  }, [form.specText]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!walletAddress || !signer) {
      await connectWallet();
      setStatus({ tone: 'info', message: 'Wallet connection requested. Confirm in MetaMask, then resubmit the escrow form.' });
      return;
    }

    if (isWrongNetwork) {
      await switchToBaseSepolia();
      setStatus({ tone: 'info', message: 'Switching to Base Sepolia. Submit again once the network change completes.' });
      return;
    }

    const paymentAmount = Number(form.paymentAmount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setStatus({ tone: 'error', message: 'Enter a valid USDC payment amount greater than zero.' });
      return;
    }

    if (!form.specText.trim()) {
      setStatus({ tone: 'error', message: 'Describe the service specification before creating the escrow.' });
      return;
    }

    if (!agent.active) {
      setStatus({ tone: 'error', message: 'This agent is not active on the on-chain StakeRegistry, so escrow creation is unavailable.' });
      return;
    }

    const deadlineTimestamp = Math.floor(new Date(form.deadline).getTime() / 1000);
    if (!Number.isFinite(deadlineTimestamp) || deadlineTimestamp <= Math.floor(Date.now() / 1000)) {
      setStatus({ tone: 'error', message: 'Choose a deadline in the future.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setCreatedEscrowId('');

      const result = await createAndFundEscrow({
        signer,
        agentAddress,
        paymentAmount: form.paymentAmount,
        specHash: ethers.keccak256(ethers.toUtf8Bytes(form.specText.trim())),
        deadlineTimestamp,
        onStatus: (message) => setStatus({ tone: 'info', message }),
      });

      const resolvedEscrowId = result.escrowId.toString();
      setCreatedEscrowId(resolvedEscrowId);
      setStatus({ tone: 'success', message: `Escrow ${resolvedEscrowId} created and funded successfully.` });
    } catch (submitError) {
      setStatus({ tone: 'error', message: parseWalletError(submitError) });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <LoadingState label="Loading Escrow Counterparty" />;
  }

  if (!agent) {
    return (
      <EmptyState
        title="Agent unavailable"
        description={error || 'This escrow target could not be resolved from the discovery engine.'}
        action={
          <Link
            to="/discover"
            className="rounded-2xl border border-primary/20 px-5 py-3 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/8"
          >
            Return to Discover
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Escrow Creation"
        title={`Create funded escrow for ${agent.name}`}
        description="Lock Mock USDC on Base Sepolia against a hashed service specification, then move the engagement into the verifiable delivery workflow."
      />

      {walletError ? <Banner tone="warning" message={walletError} /> : null}
      {status.message ? <Banner tone={status.tone} message={status.message} /> : null}
      {!agent.active ? (
        <Banner
          tone="warning"
          message="This agent is not currently active on the on-chain StakeRegistry. Escrow creation is disabled until the registry reports the agent as active."
        />
      ) : null}

      {!walletAddress ? (
        <article className="panel rounded-[32px] p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Wallet Required</div>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.06em] text-text">Connect MetaMask to create escrow.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300/76">
                The buyer wallet signs the approval, escrow creation, and funding transactions on Base Sepolia.
              </p>
            </div>
            <button
              type="button"
              onClick={connectWallet}
              disabled={!hasWallet || isConnecting}
              className="electric-button inline-flex items-center justify-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold uppercase tracking-[0.26em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isConnecting ? <LoaderCircle size={18} className="animate-spin" /> : <Wallet size={18} />}
              {hasWallet ? (isConnecting ? 'Connecting' : 'Connect Wallet') : 'MetaMask Required'}
            </button>
          </div>
        </article>
      ) : null}

      <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={handleSubmit} className="panel rounded-[32px] p-6 md:p-8">
          <div className="mb-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.34em] text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Buyer Funding Parameters
          </div>

          <div className="space-y-8">
            <div>
              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                Payment Amount (USDC)
              </label>
              <div className="rounded-2xl border border-white/8 bg-background/70 px-4 py-4">
                <div className="flex items-center gap-3">
                  <Coins size={18} className="text-primary" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.paymentAmount}
                    onChange={(event) => setForm((current) => ({ ...current, paymentAmount: event.target.value }))}
                    placeholder="100.00"
                    className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted/55"
                  />
                  <span className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-text">
                    USDC
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                Service Specification
              </label>
              <textarea
                value={form.specText}
                onChange={(event) => setForm((current) => ({ ...current, specText: event.target.value }))}
                rows={7}
                placeholder="Describe the deliverable, acceptance criteria, data sources, format requirements, and any verification rules the agent must satisfy..."
                className="min-h-[220px] w-full rounded-3xl border border-white/8 bg-background/70 px-4 py-4 outline-none transition placeholder:text-muted/55 focus:border-primary/35"
              />
              <p className="mt-2 text-sm text-slate-300/68">
                The raw spec stays off-chain. The contract stores only its <span className="font-mono text-primary">keccak256</span> hash.
              </p>
            </div>

            <div>
              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                Deadline
              </label>
              <div className="rounded-2xl border border-white/8 bg-background/70 px-4 py-4">
                <div className="flex items-center gap-3">
                  <CalendarClock size={18} className="text-primary" />
                  <input
                    type="datetime-local"
                    min={buildMinimumDeadlineInput()}
                    value={form.deadline}
                    onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))}
                    className="w-full bg-transparent outline-none"
                  />
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-300/68">Selected settlement deadline: {formatDateTime(Math.floor(new Date(form.deadline).getTime() / 1000))}</p>
            </div>

            <div className="rounded-3xl border border-primary/12 bg-primary/8 p-5 text-sm leading-7 text-slate-300/76">
              Escrow creation performs the full on-chain flow: approve Mock USDC to the escrow contract, create the escrow agreement, then fund it in a second transaction step.
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isConnecting || !hasWallet || !agent.active}
              className="electric-button inline-flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold uppercase tracking-[0.28em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <LoaderCircle size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {isSubmitting ? 'Creating Escrow' : 'Create & Fund Escrow'}
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <article className="panel rounded-[32px] p-6 md:p-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Escrow Counterparty</div>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.06em] text-text">{agent.name}</h2>
              </div>
              <StatusBadge status={agent.status} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 font-mono text-sm text-primary">
                  {truncateAddress(agent.address, 8, 6)}
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-300/78">{agent.capability}</p>
                <div className="mt-5 flex flex-wrap gap-2">
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
              <AssayScoreRing value={agent.assayScore} />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <MetricCard label="Stake" value={formatUsdcCompact(agent.stake)} />
              <MetricCard label="Assay Score" value={agent.assayScore.toLocaleString()} />
            </div>
          </article>

          <article className="panel rounded-[28px] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileText size={18} />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted">Spec Hash Preview</div>
                <div className="mt-1 font-mono text-sm text-primary break-all">{specHashPreview}</div>
              </div>
            </div>
          </article>

          {createdEscrowId ? (
            <article className="rounded-[28px] border border-success/25 bg-success/10 p-5 text-success">
              <div className="text-xs font-semibold uppercase tracking-[0.32em]">Escrow Ready</div>
              <p className="mt-3 text-sm leading-7">
                Escrow <span className="font-mono">#{createdEscrowId}</span> has been funded and is now waiting for agent delivery.
              </p>
              <Link
                to={`/escrow/${createdEscrowId}`}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-success/25 px-4 py-3 text-sm font-semibold transition hover:bg-success/10"
              >
                View Escrow
                <Wallet size={16} />
              </Link>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Banner({ tone, message }) {
  const tones = {
    success: 'border-success/25 bg-success/10 text-success',
    warning: 'border-warning/25 bg-warning/10 text-warning',
    error: 'border-danger/25 bg-danger/10 text-danger',
    info: 'border-primary/20 bg-primary/10 text-primary',
  };

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${tones[tone] ?? tones.info}`}>{message}</div>;
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/4 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">{label}</div>
      <div className="mt-2 text-lg font-semibold text-text">{value}</div>
    </div>
  );
}

function buildDefaultDeadlineInput() {
  const target = new Date(Date.now() + 48 * 60 * 60 * 1000);
  return formatDateTimeInput(target);
}

function buildMinimumDeadlineInput() {
  const target = new Date(Date.now() + 5 * 60 * 1000);
  return formatDateTimeInput(target);
}

function formatDateTimeInput(value) {
  const normalized = new Date(value.getTime() - value.getTimezoneOffset() * 60 * 1000);
  return normalized.toISOString().slice(0, 16);
}
