import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles/theme.css';
import './output.css';
import SiteLayout from './layouts/SiteLayout';
import EditorV2Shell from './features/editorV2/EditorV2Shell';
import Home from './pages/Home';
import Pricing from './pages/Pricing';
import Templates from './pages/Templates';
import Features from './pages/Features';
import NotFound from './pages/NotFound';
import AuthGate from './features/auth/AuthGate';
import AccountPage from './features/account/AccountPage';
import VerifyEmail from './features/auth/VerifyEmail';
import ResetPassword from './features/auth/ResetPassword';
import AuthModal from './features/auth/AuthModal';
import ToastContainer from './features/editorV2/ToastContainer';
import HealthBanner from './components/HealthBanner';
import DashboardLayout from './features/dashboard/DashboardLayout';
import HomePage from './features/dashboard/pages/HomePage';
import BotsPage from './features/dashboard/pages/BotsPage';
import TemplatesPage from './features/dashboard/pages/TemplatesPage';
import BalancePage from './features/dashboard/pages/BalancePage';
import AnalyticsPage from './features/dashboard/pages/AnalyticsPage';
import TeamPage from './features/dashboard/pages/TeamPage';
import SettingsPage from './features/dashboard/pages/SettingsPage';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <HealthBanner />
      <Routes>
        <Route path="/" element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="templates" element={<Templates />} />
          <Route path="features" element={<Features />} />
          <Route
            path="account"
            element={
              <AuthGate>
                <AccountPage />
              </AuthGate>
            }
          />
          <Route path="auth/verify" element={<VerifyEmail />} />
          <Route path="auth/reset" element={<ResetPassword />} />
          <Route path="editor/:id" element={<EditorV2Shell />} />

          {/* Dashboard routes */}
          <Route
            path="dashboard"
            element={
              <AuthGate>
                <DashboardLayout />
              </AuthGate>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="bots" element={<BotsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="balance" element={<BalancePage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <AuthModal />
      <ToastContainer />
    </BrowserRouter>
  </React.StrictMode>
);
