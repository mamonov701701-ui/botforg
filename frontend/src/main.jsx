import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/theme.css';
import './output.css';
import SiteLayout from './layouts/SiteLayout';
import EditorV2Shell from './features/editorV2/EditorV2Shell';
import QuickEditorEntry from './features/editorV2/QuickEditorEntry';
import Home from './pages/Home';
import Pricing from './pages/Pricing';
import MarketplacePage from './pages/MarketplacePage';
import DeveloperTemplatesPage from './pages/DeveloperTemplatesPage';
import FeaturesPage from './pages/features/FeaturesPage';
import NotFound from './pages/NotFound';
import Login from './pages/Login';
import AuthGate from './features/auth/AuthGate';
import VerifyEmail from './features/auth/VerifyEmail';
import ResetPassword from './features/auth/ResetPassword';
import AuthModal from './features/auth/AuthModal';
import ToastContainer from './features/editorV2/ToastContainer';
import HealthBanner from './components/HealthBanner';
import DashboardLayout from './features/dashboard/DashboardLayout';
import HomePage from './features/dashboard/pages/HomePage';
import BotsPage from './features/dashboard/pages/BotsPage';
import ScenariosPage from './features/dashboard/pages/ScenariosPage';
import TemplatesPage from './features/dashboard/pages/TemplatesPage';
import BalancePage from './features/dashboard/pages/BalancePage';
import AnalyticsPage from './features/dashboard/pages/AnalyticsPage';
import TeamPage from './features/dashboard/pages/TeamPage';
import BFTeamPage from './features/dashboard/pages/BFTeamPage';
import SettingsPage from './features/dashboard/pages/SettingsPage';
import PlatformOverviewPage from './features/dashboard/pages/PlatformOverviewPage';
import PlatformUsersPage from './features/dashboard/pages/PlatformUsersPage';
import PlatformAnalyticsPage from './features/dashboard/pages/PlatformAnalyticsPage';
import UserDetailPage from './features/dashboard/pages/UserDetailPage';
import MessagesPage from './features/dashboard/pages/MessagesPage';
import BotCrmLayout from './features/dashboard/crm/BotCrmLayout';
import BotCrmUsersPage from './features/dashboard/crm/BotCrmUsersPage';
import BotCrmUserDetailPage from './features/dashboard/crm/BotCrmUserDetailPage';
import BotCrmVariablesPage from './features/dashboard/crm/BotCrmVariablesPage';
import BotCrmTagsPage from './features/dashboard/crm/BotCrmTagsPage';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <HealthBanner />
      <Routes>
        <Route path="/" element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="login" element={<Login />} />
          <Route path="market" element={<MarketplacePage />} />
          <Route
            path="developer/templates"
            element={
              <AuthGate>
                <DeveloperTemplatesPage />
              </AuthGate>
            }
          />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="auth/verify" element={<VerifyEmail />} />
          <Route path="auth/reset" element={<ResetPassword />} />
          {/* Быстрый вход в редактор:
              /editor  → подбирает/создаёт бота и сценарий и редиректит в /editor/:botId
              /editor/:id → непосредственно оболочка редактора для конкретного бота */}
          <Route
            path="editor"
            element={
              <AuthGate>
                <QuickEditorEntry />
              </AuthGate>
            }
          />
          <Route
            path="editor/:id"
            element={
              <AuthGate>
                <EditorV2Shell />
              </AuthGate>
            }
          />

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
            <Route path="scenarios" element={<ScenariosPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="balance" element={<BalancePage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="bf-team" element={<BFTeamPage />} />
            <Route path="settings" element={<SettingsPage />} />

            <Route path="bots/:botId/crm" element={<BotCrmLayout />}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<BotCrmUsersPage />} />
              <Route path="users/:ctorUserId" element={<BotCrmUserDetailPage />} />
              <Route path="variables" element={<BotCrmVariablesPage />} />
              <Route path="tags" element={<BotCrmTagsPage />} />
            </Route>

            {/* Platform admin routes */}
            <Route path="platform" element={<PlatformOverviewPage />} />
            <Route path="platform/users" element={<PlatformUsersPage />} />
            <Route path="platform/users/:userId" element={<UserDetailPage />} />
            <Route path="platform/analytics" element={<PlatformAnalyticsPage />} />
            <Route path="platform/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <AuthModal />
      <ToastContainer />
    </BrowserRouter>
  </React.StrictMode>
);
