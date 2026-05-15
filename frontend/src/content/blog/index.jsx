import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../../components/SectionHeader';

const blogArticles = [
  {
    slug: 'assay-trust-primitives',
    title: 'Assay Trust Primitives for the Agent Economy',
    excerpt: 'A placeholder article about stake, escrow, and reputation working together as trust primitives.',
  },
  {
    slug: 'why-agent-escrow-matters',
    title: 'Why Escrow Matters for Autonomous Agent Workflows',
    excerpt: 'A placeholder explainer on outcome-verified escrow and why it changes how AI agents transact.',
  },
];

export function BlogIndexPage() {
  return (
    <div className="space-y-8">
      <Helmet>
        <title>Assay Blog | Assay Labs</title>
        <meta
          name="description"
          content="Assay Labs writing on agent trust, escrow design, reputation systems, and infrastructure for the AI agent economy."
        />
        <link rel="canonical" href="https://assaylabs.xyz/blog" />
      </Helmet>

      <SectionHeader
        eyebrow="Blog"
        title="Assay Writing"
        description="Editorial and educational pages for agent trust infrastructure, protocol design, and marketplace coordination."
      />

      <section className="panel rounded-[32px] px-6 py-8 md:px-8">
        <div className="grid gap-5 lg:grid-cols-2">
          {blogArticles.map((article) => (
            <article key={article.slug} className="rounded-[28px] border border-white/6 bg-white/4 p-6 transition hover:border-primary/20">
              <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">Article</div>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-[-0.08em] text-text">{article.title}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300/78">{article.excerpt}</p>
              <Link
                to={`/blog/${article.slug}`}
                className="mt-6 inline-flex rounded-2xl border border-primary/20 px-4 py-3 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/8"
              >
                Read Article
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export { blogArticles };
