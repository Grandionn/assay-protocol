import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { SectionHeader } from '../components/SectionHeader';

const BADGE_API_URL = 'https://assay-discovery-api.onrender.com';
const DEFAULT_EXAMPLE_ADDRESS = 'erc8004-0';

export function BadgePage() {
  const [searchParams] = useSearchParams();
  const selectedAddress = searchParams.get('address') || DEFAULT_EXAMPLE_ADDRESS;
  const badgeUrl = `${BADGE_API_URL}/badge/${encodeURIComponent(selectedAddress)}`;
  const markdownSnippet = `![Assay Score](${BADGE_API_URL}/badge/AGENT_ADDRESS)`;
  const htmlSnippet = `<img src='${BADGE_API_URL}/badge/AGENT_ADDRESS' alt='Assay Score' />`;

  return (
    <div className="space-y-8">
      <Helmet>
        <title>Embed Your Assay Score | Assay Labs</title>
        <meta
          name="description"
          content="Add your Assay Score badge to GitHub READMEs and websites."
        />
        <link rel="canonical" href="https://assaylabs.xyz/badge" />
      </Helmet>

      <SectionHeader
        eyebrow="Badge"
        title="Embed Your Assay Score"
        description="Add a live Assay Score badge to README files, docs, profiles, or any site that supports image embeds."
      />

      <section className="panel rounded-[32px] px-6 py-8 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[28px] border border-white/6 bg-white/4 p-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">Live Example</div>
            <div className="mt-5 rounded-[24px] border border-white/6 bg-background/70 p-6">
              <img src={badgeUrl} alt="Assay Score badge example" className="h-5 w-[200px]" />
              <div className="mt-4 text-sm leading-7 text-slate-300/76">
                Showing the badge for <span className="font-mono text-primary">{selectedAddress}</span>.
              </div>
            </div>
          </article>

          <div className="space-y-6">
            <article className="rounded-[28px] border border-white/6 bg-white/4 p-6">
              <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">GitHub Markdown</div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/6 bg-background/70 p-4 text-sm leading-7 text-slate-200">
                <code>{markdownSnippet}</code>
              </pre>
            </article>

            <article className="rounded-[28px] border border-white/6 bg-white/4 p-6">
              <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">HTML Embed</div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/6 bg-background/70 p-4 text-sm leading-7 text-slate-200">
                <code>{htmlSnippet}</code>
              </pre>
            </article>

            <div className="rounded-[28px] border border-primary/12 bg-primary/8 p-6 text-sm leading-7 text-slate-300/78">
              Replace <span className="font-mono text-primary">AGENT_ADDRESS</span> with your Assay agent address or an ERC-8004
              synthetic key such as <span className="font-mono text-primary">erc8004-0</span>.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
