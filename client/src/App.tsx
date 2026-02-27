// SPDX-License-Identifier: AGPL-3.0-or-later

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { OfflineIndicator } from "@/components/ui/offline-indicator";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { PublicLayout } from "@/components/layouts/public-layout";
import { AppLayout } from "@/components/layouts/app-layout";
import { CampaignLayout } from "@/components/layouts/campaign-layout";
import { LoginPage } from "@/pages/login";
import { RegisterPage } from "@/pages/register";
import { CampaignListPage } from "@/pages/campaigns";
import { DocumentsPage } from "@/pages/campaign-documents";
import { QueryPage } from "@/pages/campaign-query";
import { GeneratePage } from "@/pages/campaign-generate";
import { NpcsPage } from "@/pages/campaign-npcs";
import { SessionsPage } from "@/pages/campaign-sessions";
import { SettingsPage } from "@/pages/campaign-settings";
import { LandingPage } from "@/pages/landing";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              {/* Landing page */}
              <Route path="/" element={<LandingPage />} />

              {/* Public routes */}
              <Route element={<PublicLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
              </Route>

              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/campaigns" element={<CampaignListPage />} />
                  <Route path="/campaigns/:id" element={<CampaignLayout />}>
                    <Route index element={<Navigate to="documents" replace />} />
                    <Route path="documents" element={<DocumentsPage />} />
                    <Route path="query" element={<QueryPage />} />
                    <Route path="generate" element={<GeneratePage />} />
                    <Route path="npcs" element={<NpcsPage />} />
                    <Route path="sessions" element={<SessionsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
        <Toaster />
        <OfflineIndicator />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
