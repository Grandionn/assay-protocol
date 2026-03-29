import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/LoadingState';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then((module) => ({ default: module.DiscoverPage })));
const AgentProfilePage = lazy(() =>
  import('./pages/AgentProfilePage').then((module) => ({ default: module.AgentProfilePage }))
);
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const CreateEscrowPage = lazy(() =>
  import('./pages/CreateEscrowPage').then((module) => ({ default: module.CreateEscrowPage }))
);
const EscrowDetailPage = lazy(() =>
  import('./pages/EscrowDetailPage').then((module) => ({ default: module.EscrowDetailPage }))
);

function App() {
  return (
    <Suspense fallback={<LoadingState label="Loading Route" />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LandingPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/agent/:address" element={<AgentProfilePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/escrow/create/:agentAddress" element={<CreateEscrowPage />} />
          <Route path="/escrow/:escrowId" element={<EscrowDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
