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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
