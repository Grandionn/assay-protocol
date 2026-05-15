import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../../components/SectionHeader';

export function ComparePageLayout({ slug, title, description, intro, rows, whyItMatters, tableHeaders, ctaLabel }) {
  return (
    <div className="space-y-8">
      <Helmet>
        <title>{`${title} | Assay Labs`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`https://assaylabs.xyz/compare/${slug}`} />
      </Helmet>

      <SectionHeader eyebrow="Compare" title={title} description={description} />

      <section className="panel rounded-[32px] px-6 py-8 md:px-8">
        <div className="max-w-4xl space-y-8">
          <div className="space-y-4 text-sm leading-8 text-slate-300/80">
            {intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <div className="overflow-x-auto rounded-[28px] border border-white/6 bg-white/3">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/6 text-[10px] font-semibold uppercase tracking-[0.32em] text-muted">
                  <th className="px-6 py-4">{tableHeaders[0]}</th>
                  <th className="px-6 py-4">{tableHeaders[1]}</th>
                  <th className="px-6 py-4">{tableHeaders[2]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b border-white/6 last:border-b-0">
                    <td className="px-6 py-4 text-sm font-semibold text-text">{row.label}</td>
                    <td className="px-6 py-4 text-sm leading-7 text-slate-300/80">{row.assay}</td>
                    <td className="px-6 py-4 text-sm leading-7 text-slate-300/80">{row.other}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-[28px] border border-primary/12 bg-primary/8 p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Why it matters</div>
            <div className="mt-4 space-y-4 text-sm leading-8 text-slate-300/80">
              {whyItMatters.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/register"
              className="electric-button inline-flex rounded-2xl px-5 py-3 text-sm font-semibold uppercase tracking-[0.26em] transition hover:brightness-110"
            >
              {ctaLabel}
            </Link>
            <Link
              to="/compare"
              className="rounded-2xl border border-white/8 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-primary/20 hover:bg-primary/8 hover:text-primary"
            >
              More Comparisons
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
