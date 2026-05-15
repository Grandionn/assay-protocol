import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { AssayVsMnemomPage } from './assay-vs-mnemom';
import { AssayVsVerityPage } from './assay-vs-verity';

const compareRoutes = {
  'assay-vs-verity': AssayVsVerityPage,
  'assay-vs-mnemom': AssayVsMnemomPage,
};

export function ComparePage() {
  const { slug } = useParams();
  const PageComponent = compareRoutes[slug];

  if (!PageComponent) {
    return (
      <EmptyState
        title="Comparison unavailable"
        description="This comparison page has not been published yet."
        action={
          <Link
            to="/compare"
            className="rounded-2xl border border-primary/20 px-5 py-3 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/8"
          >
            View All Comparisons
          </Link>
        }
      />
    );
  }

  return <PageComponent />;
}
