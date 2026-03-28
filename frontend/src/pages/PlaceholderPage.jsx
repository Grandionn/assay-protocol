import { Link } from 'react-router-dom';
import { SectionHeader } from '../components/SectionHeader';

export function PlaceholderPage({ eyebrow, title, description }) {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow={eyebrow} title={title} description={description} />
      <section className="panel rounded-[28px] px-6 py-10 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <div className="text-sm font-semibold uppercase tracking-[0.32em] text-primary">MVP Placeholder</div>
            <p className="max-w-2xl text-base leading-7 text-slate-300/78">
              This route is intentionally present so the React shell mirrors the navigation system from the HTML mockups
              while deeper functionality is still being wired.
            </p>
          </div>
          <div className="rounded-3xl border border-primary/12 bg-primary/8 p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Next actionable route</div>
            <Link
              to="/discover"
              className="mt-4 inline-flex rounded-xl border border-primary/20 px-4 py-3 text-sm font-semibold text-text transition hover:border-primary/40 hover:bg-primary/8"
            >
              Return to Discover
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

