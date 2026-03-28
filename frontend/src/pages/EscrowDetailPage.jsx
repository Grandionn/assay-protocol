import { CheckCircle2, FileCheck2, FileText, LoaderCircle, ShieldCheck, Wallet } from 'lucide-react';
import { ethers } from 'ethers';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { SectionHeader } from '../components/SectionHeader';
import { useWallet } from '../contexts/WalletContext';
import { fetchIndexedAgent } from '../lib/api';
import { hydrateAgent } from '../lib/agent';
import {
  fetchEscrowDetails,
  getContracts,
  parseWalletError,
  submitDeliverable,
  verifyAndSettle,
} from '../lib/contracts';
import { formatDateTime, formatUsdc, truncateAddress } from '../lib/format';

export function EscrowDetailPage() {
  const { escrowId } = useParams();
  const {
    address: walletAddress,
    connectWallet,
    error: walletError,
    hasWallet,
    isConnecting,
    isWrongNetwork,
    provider,
    signer,
    switchToBaseSepolia,
  } = useWallet();

  const [escrow, setEscrow] = useState(null);
  const [agentProfile, setAgentProfile] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizedVerifier, setIsAuthorizedVerifier] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [status, setStatus] = useState({ tone: '', message: '' });
  const [deliverableText, setDeliverableText] = useState('');
  const [qualityScore, setQualityScore] = useState('100');

  async function loadEscrowState() {
    if (!provider) {
      if (!hasWallet) {
        setError('MetaMask is required to read Base Sepolia escrow state.');
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const details = await fetchEscrowDetails(provider, escrowId);
      const verifierFlag = walletAddress
        ? await getContracts(provider).escrow.isAuthorizedVerifier(walletAddress)
        : false;
      const indexedAgent = await fetchIndexedAgent(details.agent).catch(() => null);

      setEscrow(details);
      setIsAuthorizedVerifier(Boolean(verifierFlag));
      setAgentProfile(hydrateAgent(indexedAgent?.agent ?? { address: details.agent }));
    } catch (loadError) {
      setEscrow(null);
      setAgentProfile(null);
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadEscrowState();
  }, [provider, walletAddress, escrowId]);

  const isAgent = useMemo(() => {
    if (!walletAddress || !escrow?.agent) {
      return false;
    }

    return walletAddress.toLowerCase() === escrow.agent.toLowerCase();
  }, [escrow?.agent, walletAddress]);

  const canSubmitDeliverable = Boolean(signer) && isAgent && escrow?.statusLabel === 'Funded';
  const canVerifySettlement = Boolean(signer) && isAuthorizedVerifier && escrow?.statusLabel === 'Submitted';

  async function handleSubmitDeliverable(event) {
    event.preventDefault();

    if (isActing) {
      return;
    }

    if (!walletAddress || !signer) {
      await connectWallet();
      setStatus({ tone: 'info', message: 'Wallet connection requested. Confirm MetaMask, then submit the deliverable.' });
      return;
    }

    if (isWrongNetwork) {
      await switchToBaseSepolia();
      setStatus({ tone: 'info', message: 'Switching to Base Sepolia. Submit the deliverable again once the network change completes.' });
      return;
    }

    if (!deliverableText.trim()) {
      setStatus({ tone: 'error', message: 'Enter a deliverable description before submitting.' });
      return;
    }

    try {
      setIsActing(true);
      await submitDeliverable({
        signer,
        escrowId: escrow.escrowId,
        deliverableHash: ethers.keccak256(ethers.toUtf8Bytes(deliverableText.trim())),
        onStatus: (message) => setStatus({ tone: 'info', message }),
      });
      setDeliverableText('');
      setStatus({ tone: 'success', message: 'Deliverable submitted on-chain. The escrow is now awaiting verifier action.' });
      await loadEscrowState();
    } catch (submitError) {
      setStatus({ tone: 'error', message: parseWalletError(submitError) });
    } finally {
      setIsActing(false);
    }
  }

  async function handleVerifyAndSettle() {
    if (isActing) {
      return;
    }

    if (!walletAddress || !signer) {
      await connectWallet();
      setStatus({ tone: 'info', message: 'Wallet connection requested. Confirm MetaMask, then verify and settle the escrow.' });
      return;
    }

    if (isWrongNetwork) {
      await switchToBaseSepolia();
      setStatus({ tone: 'info', message: 'Switching to Base Sepolia. Verify again once the network change completes.' });
      return;
    }

    try {
      setIsActing(true);
      await verifyAndSettle({
        signer,
        escrowId: escrow.escrowId,
        success: true,
        qualityScore,
        onStatus: (message) => setStatus({ tone: 'info', message }),
      });
      setStatus({ tone: 'success', message: 'Escrow settled. Assay Score will update.' });
      await loadEscrowState();
    } catch (verifyError) {
      setStatus({ tone: 'error', message: parseWalletError(verifyError) });
    } finally {
      setIsActing(false);
    }
  }

  if (isLoading) {
    return <LoadingState label="Loading Escrow" />;
  }

  if (!escrow) {
    return (
      <EmptyState
        title="Escrow unavailable"
        description={error || 'The requested escrow could not be read from Base Sepolia.'}
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
        eyebrow="Escrow Detail"
        title={`Escrow #${escrow.escrowId.toString()}`}
        description="Monitor the current on-chain lifecycle stage, inspect hashed artifacts, and continue the workflow when your wallet is authorized to act."
      />

      {walletError ? <Banner tone="warning" message={walletError} /> : null}
      {status.message ? <Banner tone={status.tone} message={status.message} /> : null}
      {error ? <Banner tone="warning" message={error} /> : null}

      {!walletAddress ? (
        <article className="panel rounded-[28px] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Action Gate</div>
              <p className="mt-2 text-sm leading-7 text-slate-300/76">
                Connect MetaMask to submit deliverables or verify settlement. Read-only escrow data is still loaded from the injected Base Sepolia provider.
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
        <div className="space-y-6">
          <article className="panel rounded-[32px] p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Lifecycle Status</div>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.06em] text-text">{escrow.statusLabel}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300/78">
                  Buyer {truncateAddress(escrow.buyer, 8, 6)} engaged {agentProfile?.name ?? truncateAddress(escrow.agent, 8, 6)} under a hashed service specification.
                </p>
              </div>
              <EscrowStatusPill status={escrow.statusLabel} />
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <InfoCard label="Buyer" value={truncateAddress(escrow.buyer, 8, 6)} helper={escrow.buyer} />
              <InfoCard label="Agent" value={truncateAddress(escrow.agent, 8, 6)} helper={escrow.agent} />
              <InfoCard label="Payment" value={formatUsdc(escrow.amount)} helper="Locked Mock USDC" />
              <InfoCard label="Deadline" value={formatDateTime(Number(escrow.deadline))} helper="Settlement deadline" />
              <InfoCard label="Created" value={formatDateTime(Number(escrow.createdAt))} helper="Escrow agreement created" />
              <InfoCard
                label="Verifier"
                value={walletAddress && isAuthorizedVerifier ? 'Authorized' : 'Restricted'}
                helper={walletAddress ? 'Based on connected wallet' : 'Connect wallet to check'}
              />
            </div>
          </article>

          <article className="panel rounded-[32px] p-6 md:p-8">
            <div className="mb-5 text-xs font-semibold uppercase tracking-[0.32em] text-primary">Hashed Artifacts</div>
            <div className="space-y-5">
              <HashRow label="Specification Hash" value={escrow.specHash} />
              <HashRow label="Deliverable Hash" value={escrow.deliverableHash} emptyLabel="Awaiting agent submission" />
            </div>
          </article>

          <article className="panel rounded-[32px] p-6 md:p-8">
            <div className="mb-5 text-xs font-semibold uppercase tracking-[0.32em] text-primary">Counterparty Context</div>
            <div className="rounded-3xl border border-white/6 bg-white/4 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-display text-2xl font-bold tracking-[-0.05em] text-text">{agentProfile?.name ?? truncateAddress(escrow.agent, 8, 6)}</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300/78">{agentProfile?.capability ?? 'Discovery metadata unavailable for this agent.'}</p>
                </div>
                <Link
                  to={`/agent/${escrow.agent}`}
                  className="rounded-2xl border border-primary/20 px-4 py-3 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/8"
                >
                  View Agent
                </Link>
              </div>
            </div>
          </article>
        </div>

        <div className="space-y-6">
          {canSubmitDeliverable ? (
            <form onSubmit={handleSubmitDeliverable} className="panel rounded-[32px] p-6 md:p-8">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileText size={18} />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Agent Action</div>
                  <h3 className="mt-1 font-display text-2xl font-bold tracking-[-0.05em] text-text">Submit Deliverable</h3>
                </div>
              </div>

              <textarea
                value={deliverableText}
                onChange={(event) => setDeliverableText(event.target.value)}
                rows={6}
                placeholder="Describe the delivered work, final artifact location, or proof bundle. The UI hashes this description to bytes32 before submission."
                className="min-h-[180px] w-full rounded-3xl border border-white/8 bg-background/70 px-4 py-4 outline-none transition placeholder:text-muted/55 focus:border-primary/35"
              />
              <p className="mt-3 text-sm leading-7 text-slate-300/68">
                The text above will be hashed client-side with <span className="font-mono text-primary">keccak256(toUtf8Bytes(...))</span> before submission.
              </p>

              <button
                type="submit"
                disabled={isActing}
                className="electric-button mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold uppercase tracking-[0.28em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isActing ? <LoaderCircle size={18} className="animate-spin" /> : <FileCheck2 size={18} />}
                {isActing ? 'Submitting' : 'Submit Deliverable'}
              </button>
            </form>
          ) : null}

          {canVerifySettlement ? (
            <article className="panel rounded-[32px] p-6 md:p-8">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Verifier Action</div>
                  <h3 className="mt-1 font-display text-2xl font-bold tracking-[-0.05em] text-text">Verify & Settle</h3>
                </div>
              </div>

              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.3em] text-muted">Quality Score</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={qualityScore}
                onChange={(event) => setQualityScore(event.target.value)}
                className="w-full rounded-3xl border border-white/8 bg-background/70 px-4 py-4 outline-none transition placeholder:text-muted/55 focus:border-primary/35"
              />
              <p className="mt-3 text-sm leading-7 text-slate-300/68">
                This action calls <span className="font-mono text-primary">verifyAndSettle(escrowId, true, qualityScore)</span> on the deployed escrow contract.
              </p>

              <button
                type="button"
                onClick={handleVerifyAndSettle}
                disabled={isActing}
                className="electric-button mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold uppercase tracking-[0.28em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isActing ? <LoaderCircle size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                {isActing ? 'Settling' : 'Verify & Settle'}
              </button>
            </article>
          ) : null}

          {!canSubmitDeliverable && !canVerifySettlement ? (
            <article className="panel rounded-[32px] p-6 md:p-8">
              <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Current Action Window</div>
              <p className="mt-3 text-sm leading-7 text-slate-300/78">
                {escrow.statusLabel === 'Created'
                  ? 'The escrow agreement exists but still needs buyer funding.'
                  : escrow.statusLabel === 'Funded'
                    ? 'The escrow is funded and waiting for the agent wallet to submit a deliverable hash.'
                    : escrow.statusLabel === 'Submitted'
                      ? 'The escrow is awaiting an authorized verifier to confirm completion and settle funds.'
                      : escrow.statusLabel === 'Settled'
                        ? 'Escrow settled. Assay Score will update.'
                        : escrow.statusLabel === 'Refunded'
                          ? 'This escrow has already been refunded on-chain.'
                          : 'No additional action is exposed in the current UI for this escrow state.'}
              </p>
            </article>
          ) : null}

          {escrow.statusLabel === 'Settled' ? (
            <article className="rounded-[28px] border border-success/25 bg-success/10 p-5 text-success">
              <div className="text-xs font-semibold uppercase tracking-[0.32em]">Settlement Complete</div>
              <p className="mt-3 text-sm leading-7">Escrow settled. Assay Score will update.</p>
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

function EscrowStatusPill({ status }) {
  const styles = {
    Created: 'border-primary/25 bg-primary/10 text-primary',
    Funded: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
    Submitted: 'border-warning/25 bg-warning/10 text-warning',
    Settled: 'border-success/25 bg-success/10 text-success',
    Refunded: 'border-danger/25 bg-danger/10 text-danger',
    Disputed: 'border-white/10 bg-white/6 text-text',
  };

  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.32em]',
        styles[status] ?? styles.Created,
      ].join(' ')}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function InfoCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/4 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">{label}</div>
      <div className="mt-2 text-lg font-semibold text-text">{value}</div>
      <div className="mt-2 break-all text-xs leading-6 text-slate-300/68">{helper}</div>
    </div>
  );
}

function HashRow({ label, value, emptyLabel = 'Unavailable' }) {
  const isEmpty = !value || value === ethers.ZeroHash;

  return (
    <div className="rounded-2xl border border-white/6 bg-white/4 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">{label}</div>
      <div className="mt-3 font-mono text-sm text-primary break-all">{isEmpty ? emptyLabel : value}</div>
    </div>
  );
}
