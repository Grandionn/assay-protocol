import { Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';
import { SkeletonCard } from '../components/Skeleton';
import { useWallet } from '../contexts/WalletContext';
import { ESCROW_STATUS_LABELS, fetchEscrowDetails, getContracts } from '../lib/contracts';
import { formatDateTime, formatUsdc, truncateAddress } from '../lib/format';

export function MyEscrowsPage() {
  const { address, readProvider, connectWallet, hasWallet } = useWallet();
  const [escrows, setEscrows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadEscrows() {
      if (!readProvider || !address) {
        if (!ignore) {
          setEscrows([]);
          setError('');
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const { escrow } = getContracts(readProvider);
        const nextId = await escrow.nextEscrowId();
        const totalEscrows = Number(nextId);

        if (totalEscrows === 0) {
          if (!ignore) {
            setEscrows([]);
          }
          return;
        }

        const details = await Promise.all(
          Array.from({ length: totalEscrows }, (_, index) =>
            fetchEscrowDetails(readProvider, index).catch(() => null),
          ),
        );

        const normalizedAddress = address.toLowerCase();
        const sortedEscrows = details
          .filter(Boolean)
          .filter(
            (item) =>
              item.buyer.toLowerCase() === normalizedAddress || item.agent.toLowerCase() === normalizedAddress,
          )
          .sort((left, right) => {
            if (left.escrowId === right.escrowId) {
              return 0;
            }

            return left.escrowId > right.escrowId ? -1 : 1;
          });

        if (!ignore) {
          setEscrows(sortedEscrows);
        }
      } catch (loadError) {
        if (!ignore) {
          setEscrows([]);
          setError(loadError?.message ?? 'Unable to load your escrows.');
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadEscrows();

    return () => {
      ignore = true;
    };
  }, [readProvider, address]);

  if (!address) {
    return (
      <div className="space-y-8">
        <SectionHeader
          eyebrow="Escrows"
          title="My Escrows"
          description="Escrows where you are the buyer or the service agent."
        />
        <article className="panel mx-auto max-w-2xl rounded-[32px] p-6 text-center md:p-8">
          <h2 className="font-display text-2xl font-bold tracking-[-0.06em] text-text">Connect your wallet to view your escrows</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300/76">
            Escrows you create or receive as an agent will appear here after you connect.
          </p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={connectWallet}
              className="electric-button inline-flex items-center justify-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold uppercase tracking-[0.26em] transition hover:brightness-110"
              title={hasWallet ? 'Connect MetaMask' : 'MetaMask is required for wallet actions'}
            >
              <Wallet size={18} />
              {hasWallet ? 'Connect Wallet' : 'MetaMask Required'}
            </button>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Escrows"
        title="My Escrows"
        description="Escrows where you are the buyer or the service agent."
      />

      {error ? <div className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : null}

      {!isLoading && !error && escrows.length === 0 ? (
        <EmptyState
          title="No escrows found"
          description="Escrows you create or receive as an agent will appear here."
        />
      ) : null}

      {!isLoading && escrows.length > 0 ? (
        <div className="space-y-4">
          {escrows.map((escrow) => {
            const isBuyer = address.toLowerCase() === escrow.buyer.toLowerCase();
            const counterpartyLabel = isBuyer ? 'Agent' : 'Buyer';
            const counterpartyAddress = isBuyer ? escrow.agent : escrow.buyer;

            return (
              <Link
                key={escrow.escrowId.toString()}
                to={`/escrow/${escrow.escrowId}`}
                className="panel block rounded-[32px] p-6 transition hover:border-primary/20"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Escrow</div>
                    <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.06em] text-text">
                      {`Escrow #${escrow.escrowId.toString()}`}
                    </h2>
                  </div>
                  <EscrowStatusPill status={escrow.statusLabel} />
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <EscrowMeta label="Amount" value={formatUsdc(escrow.amount)} />
                  <EscrowMeta label={counterpartyLabel} value={truncateAddress(counterpartyAddress, 8, 6)} />
                  <EscrowMeta label="Deadline" value={formatDateTime(Number(escrow.deadline))} />
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
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

  const resolvedStatus = ESCROW_STATUS_LABELS.includes(status) ? status : 'Created';

  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.32em]',
        styles[resolvedStatus] ?? styles.Created,
      ].join(' ')}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function EscrowMeta({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/4 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">{label}</div>
      <div className="mt-2 text-lg font-semibold text-text">{value}</div>
    </div>
  );
}
