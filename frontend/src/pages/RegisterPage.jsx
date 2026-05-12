import { Coins, Info, LoaderCircle, ShieldCheck, Wallet } from 'lucide-react';
import { ethers } from 'ethers';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { getNetworkConfig } from '../config/contracts';
import { useWallet } from '../contexts/WalletContext';
import { registerIndexedAgent, signRegistrationMessage } from '../lib/api';
import { hydrateAgent, MINIMUM_STAKE_USDC } from '../lib/agent';
import { parseWalletError, registerAgent } from '../lib/contracts';
import { formatUsdcCompact, truncateAddress } from '../lib/format';

const INITIAL_ASSAY_SCORE = 0;
const INDEXING_WARNING_MESSAGE = 'On-chain registration succeeded but discovery indexing failed. Visit your profile to verify.';
const SIGNATURE_DECLINED_MESSAGE = 'Agent registered on-chain but not indexed in Discovery — signature was declined.';
const SIGNATURE_DECLINED_CODE = 'SIGNATURE_DECLINED';

export function RegisterPage() {
  const navigate = useNavigate();
  const {
    address: walletAddress,
    connectWallet,
    error: walletError,
    hasWallet,
    isConnecting,
    isWrongNetwork,
    readChainId,
    signer,
    switchToBase,
  } = useWallet();

  const [form, setForm] = useState({
    address: '',
    name: '',
    capability: '',
    erc8004AgentId: '',
    stakeAmount: '10',
  });
  const [status, setStatus] = useState({ tone: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeNetwork = getNetworkConfig(readChainId);

  useEffect(() => {
    if (walletAddress) {
      setForm((current) => ({ ...current, address: walletAddress }));
    }
  }, [walletAddress]);

  const stakeAmountMicro = safeParseUnits(form.stakeAmount);
  const previewAgent = hydrateAgent({
    address: form.address || walletAddress || '0x0000000000000000000000000000000000000000',
    name: form.name.trim(),
    capability:
      form.capability ||
      'Awaiting capability definitions. Submit the form to populate intelligence parameters and operating profile.',
    stake: Number(stakeAmountMicro),
    assayScore: INITIAL_ASSAY_SCORE,
    status: 'Under Review',
  });

  function redirectToProfile(delayMs = 2000) {
    window.setTimeout(() => {
      if (walletAddress) {
        navigate(`/agent/${walletAddress}`);
      }
    }, delayMs);
  }

  async function attemptDiscoveryIndex({ address, name, capability, stakeMicro, signer, erc8004AgentId }) {
    let signature;

    try {
      signature = await signRegistrationMessage(signer, address);
    } catch (signatureError) {
      signatureError.code = SIGNATURE_DECLINED_CODE;
      throw signatureError;
    }

    return registerIndexedAgent({
      address,
      name,
      capability,
      stake: Number(stakeMicro),
      assayScore: INITIAL_ASSAY_SCORE,
      ...(erc8004AgentId ? { erc8004AgentId: Number(erc8004AgentId) } : {}),
      signature,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!walletAddress || !signer) {
      await connectWallet();
      setStatus({ tone: 'info', message: 'Wallet connection requested. Submit once MetaMask confirms the connection.' });
      return;
    }

    if (isWrongNetwork) {
      await switchToBase();
      setStatus({ tone: 'info', message: 'Switching to Base Mainnet. Submit again once the network change finishes.' });
      return;
    }

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setStatus({ tone: 'error', message: 'Agent name is required.' });
      return;
    }

    const trimmedCapability = form.capability.trim();
    if (!trimmedCapability) {
      setStatus({ tone: 'error', message: 'Add a capability description before registering the agent.' });
      return;
    }

    const stakeAmount = Number(form.stakeAmount);
    if (!Number.isFinite(stakeAmount) || stakeAmount < MINIMUM_STAKE_USDC) {
      setStatus({ tone: 'error', message: `The minimum stake for this MVP is ${MINIMUM_STAKE_USDC} USDC.` });
      return;
    }

    try {
      setIsSubmitting(true);

      const result = await registerAgent({
        signer,
        agentAddress: walletAddress,
        capability: trimmedCapability,
        stakeAmount: form.stakeAmount,
        chainId: readChainId,
        onStatus: (message) => setStatus({ tone: 'info', message }),
      });

      setStatus({ tone: 'info', message: 'On-chain registration confirmed. Indexing the profile into the discovery engine.' });

      try {
        await attemptDiscoveryIndex({
          address: walletAddress,
          name: trimmedName,
          capability: trimmedCapability,
          stakeMicro: result.stakeAmountMicro,
          signer,
          erc8004AgentId: form.erc8004AgentId.trim() || null,
        });
        setStatus({ tone: 'success', message: 'Agent registered and indexed successfully. Redirecting to the profile view.' });
      } catch (indexError) {
        if (indexError.code === SIGNATURE_DECLINED_CODE) {
          setStatus({ tone: 'info', message: SIGNATURE_DECLINED_MESSAGE });
        } else {
          setStatus({ tone: 'warning', message: INDEXING_WARNING_MESSAGE });
        }
      }

      redirectToProfile();
    } catch (submitError) {
      const errorMessage = parseWalletError(submitError);
      const normalizedErrorMessage = errorMessage.toLowerCase();
      const shouldAttemptIndex =
        normalizedErrorMessage.includes('already registered') ||
        normalizedErrorMessage.includes('execution reverted');

      if (!shouldAttemptIndex) {
        setStatus({ tone: 'error', message: errorMessage });
        return;
      }

      setStatus({ tone: 'info', message: 'This wallet is already registered on-chain. Attempting to index the profile.' });

      try {
        await attemptDiscoveryIndex({
          address: walletAddress,
          name: trimmedName,
          capability: trimmedCapability,
          stakeMicro: stakeAmountMicro,
          signer,
          erc8004AgentId: form.erc8004AgentId.trim() || null,
        });
        setStatus({ tone: 'success', message: 'Profile indexed successfully. Redirecting to the profile view.' });
      } catch (indexError) {
        if (indexError.code === SIGNATURE_DECLINED_CODE) {
          setStatus({ tone: 'info', message: SIGNATURE_DECLINED_MESSAGE });
        } else {
          setStatus({ tone: 'warning', message: INDEXING_WARNING_MESSAGE });
        }
      }

      redirectToProfile();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Protocol Onboarding"
        title="Register a staked operator"
        description={`Connect a MetaMask wallet, commit ${activeNetwork.tokenLabel} on ${activeNetwork.chainName}, and index the profile into the Assay Discovery Engine.`}
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
                AGENT NAME
              </label>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                maxLength={64}
                placeholder="e.g. Securify, QuantLens, YieldScope..."
                className="w-full rounded-3xl border border-white/8 bg-background/70 px-4 py-4 outline-none transition placeholder:text-muted/55 focus:border-primary/35"
              />
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
                ERC-8004 Agent ID <span className="normal-case tracking-normal text-slate-300/50">(optional)</span>
              </label>
              <div className="rounded-2xl border border-white/8 bg-background/70 px-4 py-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={18} className="text-primary" />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.erc8004AgentId}
                    onChange={(event) => setForm((current) => ({ ...current, erc8004AgentId: event.target.value }))}
                    placeholder="e.g. 42"
                    className="w-full bg-transparent outline-none placeholder:text-muted/55"
                  />
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-300/68">
                If your agent has an ERC-8004 identity on Base, enter its token ID to link profiles.
                Find yours at{' '}
                <a href="https://8004.org" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  8004.org
                </a>
              </p>
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
                    placeholder="10.00"
                    className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted/55"
                  />
                  <span className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-text">
                    USDC
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm italic text-slate-300/68">Minimum stake required: 10 USDC.</p>
            </div>

            <div className="rounded-3xl border border-primary/12 bg-primary/8 p-5 text-sm leading-7 text-slate-300/76">
              Registration stakes USDC on-chain and indexes your agent into the Discovery Engine.
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
                  <PreviewMetric label="Initial Assay" value="0 / 1,000" />
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
              <li>{`1. Connect MetaMask and switch to ${activeNetwork.chainName}.`}</li>
              <li>{`2. Ensure the wallet holds enough ${activeNetwork.tokenLabel} for the stake.`}</li>
              <li>3. Submit the form to approve USDC and call <span className="font-mono text-primary">registerAgent</span>.</li>
              <li>4. The page then POSTs the agent to <span className="font-mono text-primary">/agents/register</span> and redirects to the new profile.</li>
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
