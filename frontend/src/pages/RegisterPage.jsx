import { Coins, Info, LoaderCircle, ShieldCheck, Wallet } from 'lucide-react';
import { ethers } from 'ethers';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useWallet } from '../contexts/WalletContext';
import { registerIndexedAgent } from '../lib/api';
import { calculateProvisionalAssayScore, hydrateAgent, MINIMUM_STAKE_USDC } from '../lib/agent';
import { parseWalletError, registerAgent } from '../lib/contracts';
import { formatUsdcCompact, truncateAddress } from '../lib/format';

export function RegisterPage() {
  const navigate = useNavigate();
  const {
    address: walletAddress,
    connectWallet,
    error: walletError,
    hasWallet,
    isConnecting,
    isWrongNetwork,
    signer,
    switchToBaseSepolia,
  } = useWallet();

  const [form, setForm] = useState({
    address: '',
    capability: '',
    stakeAmount: '500',
  });
  const [status, setStatus] = useState({ tone: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (walletAddress) {
      setForm((current) => ({ ...current, address: walletAddress }));
    }
  }, [walletAddress]);

  const stakeAmountMicro = safeParseUnits(form.stakeAmount);
  const previewScore = calculateProvisionalAssayScore(form.capability, Number(stakeAmountMicro), form.address);
  const previewAgent = hydrateAgent({
    address: form.address || walletAddress || '0x0000000000000000000000000000000000000000',
    capability:
      form.capability ||
      'Awaiting capability definitions. Submit the form to populate intelligence parameters and operating profile.',
    stake: Number(stakeAmountMicro),
    assayScore: previewScore,
    status: 'Under Review',
    combinedScore: 0.68,
  });

  async function handleSubmit(event) {
    event.preventDefault();

    if (!walletAddress || !signer) {
      await connectWallet();
      setStatus({ tone: 'info', message: 'Wallet connection requested. Submit once MetaMask confirms the connection.' });
      return;
    }

    if (isWrongNetwork) {
      await switchToBaseSepolia();
      setStatus({ tone: 'info', message: 'Switching to Base Sepolia. Submit again once the network change finishes.' });
      return;
    }

    if (!form.capability.trim()) {
      setStatus({ tone: 'error', message: 'Add a capability description before registering the agent.' });
      return;
    }

    const stakeAmount = Number(form.stakeAmount);
    if (!Number.isFinite(stakeAmount) || stakeAmount < MINIMUM_STAKE_USDC) {
      setStatus({ tone: 'error', message: `The minimum stake for this MVP is ${MINIMUM_STAKE_USDC} USDC.` });
      return;
    }

    let onChainComplete = false;

    try {
      setIsSubmitting(true);
      setStatus({ tone: 'info', message: 'Approving Mock USDC allowance if required, then submitting the registry transaction.' });

      const result = await registerAgent({
        signer,
        agentAddress: walletAddress,
        capability: form.capability.trim(),
        stakeAmount: form.stakeAmount,
      });

      onChainComplete = true;
      setStatus({ tone: 'info', message: 'On-chain registration confirmed. Indexing the profile into the discovery engine.' });

      await registerIndexedAgent({
        address: walletAddress,
        capability: form.capability.trim(),
        stake: Number(result.stakeAmountMicro),
        assayScore: previewScore,
      });

      setStatus({ tone: 'success', message: 'Agent registered and indexed successfully. Redirecting to the profile view.' });
      window.setTimeout(() => navigate(`/agent/${walletAddress}`), 900);
    } catch (submitError) {
      if (onChainComplete) {
        setStatus({
          tone: 'warning',
          message:
            'The registry transaction succeeded, but discovery indexing failed. You can reopen this page later to retry indexing the same capability profile.',
        });
      } else {
        setStatus({ tone: 'error', message: parseWalletError(submitError) });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Protocol Onboarding"
        title="Register a staked operator"
        description="Connect a MetaMask wallet, commit Mock USDC on Base Sepolia, and index the profile into the local discovery engine for the Assay Protocol MVP."
      />

      {walletError ? <Banner tone="warning" message={walletError} /> : null}
      {status.message ? <Banner tone={status.tone} message={status.message} /> : null}

      <section className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <form onSubmit={handleSubmit} className="panel rounded-[32px] p-6 md:p-8">
          <div className="mb-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.34em] text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Agent Configuration
          </div>

          <div className="space-y-8">
            <div>
              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                Agent Wallet Address
              </label>
              <div className="rounded-2xl border border-white/8 bg-background/70 px-4 py-4">
                <div className="flex items-center gap-3">
                  <Wallet size={18} className="text-primary" />
                  <input
                    value={form.address}
                    onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                    readOnly={Boolean(walletAddress)}
                    placeholder="0x..."
                    className="w-full bg-transparent outline-none placeholder:text-muted/55"
                  />
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-300/68">
                {walletAddress
                  ? `Connected wallet detected: ${truncateAddress(walletAddress, 8, 6)}`
                  : 'This field auto-fills after connecting MetaMask.'}
              </p>
            </div>

            <div>
              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                Capability Description
              </label>
              <textarea
                value={form.capability}
                onChange={(event) => setForm((current) => ({ ...current, capability: event.target.value }))}
                rows={5}
                placeholder="Describe the autonomous logic, decision-making framework, and utility this agent brings to the protocol..."
                className="min-h-[180px] w-full rounded-3xl border border-white/8 bg-background/70 px-4 py-4 outline-none transition placeholder:text-muted/55 focus:border-primary/35"
              />
            </div>

            <div>
              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                Stake Amount (USDC)
              </label>
              <div className="rounded-2xl border border-white/8 bg-background/70 px-4 py-4">
                <div className="flex items-center gap-3">
                  <Coins size={18} className="text-primary" />
                  <input
                    type="number"
                    min={MINIMUM_STAKE_USDC}
                    step="0.01"
                    value={form.stakeAmount}
                    onChange={(event) => setForm((current) => ({ ...current, stakeAmount: event.target.value }))}
                    placeholder="500.00"
                    className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted/55"
                  />
                  <span className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-text">
                    USDC
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm italic text-slate-300/68">Minimum stake required: 500 USDC.</p>
            </div>

            <div className="rounded-3xl border border-primary/12 bg-primary/8 p-5 text-sm leading-7 text-slate-300/76">
              For this MVP, the capability text is submitted directly to the registry contract as the manifest string and also indexed into the discovery engine with a provisional assay score.
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isConnecting || !hasWallet}
              className="electric-button inline-flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold uppercase tracking-[0.28em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <LoaderCircle size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {isSubmitting ? 'Registering' : 'Register & Stake'}
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-muted">Live Profile Preview</div>
            <article className="panel overflow-hidden rounded-[32px]">
              <div className="h-28 bg-electric-blue opacity-35" />
              <div className="relative px-6 pb-6">
                <div className="-mt-10 flex h-20 w-20 items-center justify-center rounded-[24px] border border-primary/20 bg-background text-3xl font-bold tracking-[-0.08em] text-primary shadow-glow">
                  {(previewAgent.name.match(/[A-Z]/g) ?? ['A', 'P']).slice(0, 2).join('')}
                </div>

                <div className="mt-5 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-3xl font-bold tracking-[-0.08em] text-text">{previewAgent.name}</h3>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                      Registration in progress
                    </p>
                  </div>
                  <StatusBadge status="Under Review" />
                </div>

                <div className="mt-5 rounded-2xl border border-white/6 bg-white/4 p-4 text-sm leading-7 text-slate-300/78">
                  {form.capability ||
                    'Awaiting capability definitions. Submit the form to populate intelligence parameters and market operational profile.'}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <PreviewMetric label="Total Stake" value={formatUsdcCompact(Number(stakeAmountMicro))} />
                  <PreviewMetric label="Projected Assay" value={`${previewScore.toLocaleString()} / 10,000`} />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {previewAgent.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/6 bg-white/4 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          </div>

          <article className="rounded-[28px] border border-primary/12 bg-primary/8 p-5">
            <div className="flex gap-4">
              <Info size={18} className="mt-1 shrink-0 text-primary" />
              <div>
                <h3 className="font-display text-xl font-bold tracking-[-0.04em] text-text">Staking Notes</h3>
                <p className="mt-2 text-sm leading-7 text-slate-300/76">
                  The current MVP reflects the actual on-chain stake and earnings logic from the deployed registry. Richer cooldown and governance controls are not yet surfaced in this UI.
                </p>
              </div>
            </div>
          </article>

          <article className="panel rounded-[28px] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Checklist</div>
            <ul className="mt-4 space-y-3 text-sm text-slate-300/76">
              <li>1. Connect MetaMask and switch to Base Sepolia.</li>
              <li>2. Ensure the wallet holds enough Mock USDC for the stake.</li>
              <li>3. Submit the form to approve USDC and call <span className="font-mono text-primary">registerAgent</span>.</li>
              <li>4. Wait for discovery indexing so the agent appears on the Discover page.</li>
            </ul>
          </article>
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

function PreviewMetric({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/4 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">{label}</div>
      <div className="mt-2 text-lg font-semibold text-text">{value}</div>
    </div>
  );
}

function safeParseUnits(value) {
  if (!value) {
    return 0n;
  }

  try {
    return ethers.parseUnits(value, 6);
  } catch {
    return 0n;
  }
}
