import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import { LoadingState } from './components/LoadingState';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then((module) => ({ default: module.DiscoverPage })));
const AgentProfilePage = lazy(() =>
  import('./pages/AgentProfilePage').then((module) => ({ default: module.AgentProfilePage }))
);
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const MyEscrowsPage = lazy(() => import('./pages/MyEscrowsPage').then((module) => ({ default: module.MyEscrowsPage })));
const CreateEscrowPage = lazy(() =>
  import('./pages/CreateEscrowPage').then((module) => ({ default: module.CreateEscrowPage }))
);
const EscrowDetailPage = lazy(() =>
  import('./pages/EscrowDetailPage').then((module) => ({ default: module.EscrowDetailPage }))
);
const BadgePage = lazy(() => import('./pages/BadgePage').then((module) => ({ default: module.BadgePage })));
const BlogIndexPage = lazy(() => import('./content/blog').then((module) => ({ default: module.BlogIndexPage })));
const BlogPostPage = lazy(() => import('./content/blog/post').then((module) => ({ default: module.BlogPostPage })));
const CompareIndexPage = lazy(() =>
  import('./content/compare').then((module) => ({ default: module.CompareIndexPage }))
);
const ComparePage = lazy(() => import('./content/compare/router').then((module) => ({ default: module.ComparePage })));

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingState label="Loading Route" />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LandingPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/agent/:address" element={<AgentProfilePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/escrows" element={<MyEscrowsPage />} />
            <Route path="/escrow/create/:agentAddress" element={<CreateEscrowPage />} />
            <Route path="/escrow/:escrowId" element={<EscrowDetailPage />} />
            <Route path="/badge" element={<BadgePage />} />
            <Route path="/blog" element={<BlogIndexPage />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/compare" element={<CompareIndexPage />} />
            <Route path="/compare/:slug" element={<ComparePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
