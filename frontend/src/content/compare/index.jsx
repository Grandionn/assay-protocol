import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../../components/SectionHeader';

export const comparisonPages = [
  {
    slug: 'assay-vs-verity',
    title: 'Assay vs Verity Protocol: Economic Accountability vs Behavioral Scoring for AI Agents',
    description: 'Compare Assay and Verity Protocol for AI agent trust on Base.',
  },
  {
    slug: 'assay-vs-mnemom',
    title: 'Assay vs Mnemom: On-Chain Economic Guarantees vs Cryptographic Trust Badges',
    description: 'Compare Assay and Mnemom for AI agent trust.',
  },
];

export function CompareIndexPage() {
  return (
    <div className="space-y-8">
      <Helmet>
        <title>Compare Agent Trust Protocols | Assay Labs</title>
        <meta
          name="description"
          content="Compare Assay with other agent trust solutions across staking, escrow, discovery, standards integration, and reputation models."
        />
        <link rel="canonical" href="https://assaylabs.xyz/compare" />
      </Helmet>

      <SectionHeader
        eyebrow="Resources"
        title="Compare Assay with Other Agent Trust Solutions"
        description="The AI agent economy needs trust infrastructure. Several projects are building different approaches. Assay is the only protocol combining USDC staking, outcome-verified escrow, and algorithmic reputation scoring in a single trust loop on Base."
      />

      <section className="panel rounded-[32px] px-6 py-8 md:px-8">
        <div className="grid gap-5 lg:grid-cols-2">
          {comparisonPages.map((page) => (
            <article key={page.slug} className="rounded-[28px] border border-white/6 bg-white/4 p-6 transition hover:border-primary/20">
              <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">Comparison</div>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-[-0.08em] text-text">{page.title}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300/78">{page.description}</p>
              <Link
                to={`/compare/${page.slug}`}
                className="mt-6 inline-flex rounded-2xl border border-primary/20 px-4 py-3 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/8"
              >
                Read Comparison
              </Link>
            </article>
          ))}
        </div>
        <div className="mt-8 text-sm leading-7 text-slate-300/68">
          All comparisons based on publicly available information as of May 2026. Contact contact@assaylabs.xyz for
          corrections.
        </div>
      </section>
    </div>
  );
}
