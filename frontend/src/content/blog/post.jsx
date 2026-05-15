import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { SectionHeader } from '../../components/SectionHeader';
import { blogArticles } from './index';

export function BlogPostPage() {
  const { slug } = useParams();
  const article = blogArticles.find((entry) => entry.slug === slug);

  if (!article) {
    return (
      <EmptyState
        title="Article unavailable"
        description="This blog entry has not been published yet."
        action={
          <Link
            to="/blog"
            className="rounded-2xl border border-primary/20 px-5 py-3 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/8"
          >
            Back to Blog
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <Helmet>
        <title>{`${article.title} | Assay Labs`}</title>
        <meta name="description" content={article.excerpt} />
        <link rel="canonical" href={`https://assaylabs.xyz/blog/${article.slug}`} />
      </Helmet>

      <SectionHeader eyebrow="Blog" title={article.title} description={article.excerpt} />

      <section className="panel rounded-[32px] px-6 py-8 md:px-8">
        <div className="max-w-3xl space-y-6 text-sm leading-8 text-slate-300/80">
          <p>
            This is a placeholder blog post route for future Assay editorial content. It gives the frontend a static SEO
            surface now, while keeping the content model simple and expandable.
          </p>
          <p>
            We can later swap this file-backed placeholder system for richer authored content without changing the route
            shape or the public URL structure.
          </p>
        </div>
      </section>
    </div>
  );
}
