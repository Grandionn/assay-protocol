import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/LoadingState';

const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then((module) => ({ default: module.DiscoverPage })));
const AgentProfilePage = lazy(() =>
  import('./pages/AgentProfilePage').then((module) => ({ default: module.AgentProfilePage }))
);
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const PlaceholderPage = lazy(() =>
  import('./pages/PlaceholderPage').then((module) => ({ default: module.PlaceholderPage }))
);

function App() {
  return (
    <Suspense fallback={<LoadingState label="Loading Route" />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DiscoverPage />} />
          <Route path="/agent/:address" element={<AgentProfilePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/analytics"
            element={
              <PlaceholderPage
                eyebrow="Analytics"
                title="Protocol analytics will land next."
                description="Treasury flows, slashing activity, and execution-quality cohorts are reserved for the next milestone."
              />
            }
          />
          <Route
            path="/settings"
            element={
              <PlaceholderPage
                eyebrow="Settings"
                title="Operator controls are coming soon."
                description="Wallet preferences, notification rules, and team-level registry permissions have been stubbed for the MVP."
              />
            }
          />
          <Route
            path="/support"
            element={
              <PlaceholderPage
                eyebrow="Support"
                title="Support channels will be wired after launch."
                description="For now, the UI keeps a placeholder entry point so the navigation matches the institutional shell from the mockups."
              />
            }
          />
          <Route
            path="/docs"
            element={
              <PlaceholderPage
                eyebrow="Docs"
                title="Protocol docs are on the roadmap."
                description="Contract references, registry semantics, and escrow lifecycle notes can be linked here once the documentation portal is published."
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
