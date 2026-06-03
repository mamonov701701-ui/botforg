import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import './styles/theme.css';
import './output.css';
import SiteLayout from './layouts/SiteLayout';
import EditorV2Shell from './features/editorV2/EditorV2Shell';
import QuickEditorEntry from './features/editorV2/QuickEditorEntry';
import Home from './pages/Home';
import Pricing from './pages/Pricing';
import MarketplacePage from './pages/MarketplacePage';
import MarketItemDetailPage from './pages/MarketItemDetailPage';
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
import ScenarioDetailPage from './features/dashboard/pages/ScenarioDetailPage';
import TemplatesPage from './features/dashboard/pages/TemplatesPage';
import BalancePage from './features/dashboard/pages/BalancePage';
import TariffLimitsPage from './features/dashboard/pages/TariffLimitsPage';
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
import BotCrmOverviewPage from './features/dashboard/crm/BotCrmOverviewPage';
import BotCrmContactsPage from './features/dashboard/crm/BotCrmContactsPage';
import BotCrmContactDetailPage from './features/dashboard/crm/BotCrmContactDetailPage';
import BotCrmFieldsPage from './features/dashboard/crm/BotCrmFieldsPage';
import BotCrmTagsPage from './features/dashboard/crm/BotCrmTagsPage';
import BotCrmStatusesPage from './features/dashboard/crm/BotCrmStatusesPage';
import BotWorkspaceLayout from './features/dashboard/botWorkspace/BotWorkspaceLayout';
import BotWorkspaceOverviewPage from './features/dashboard/botWorkspace/BotWorkspaceOverviewPage';
import BotWorkspaceScenariosPage from './features/dashboard/botWorkspace/BotWorkspaceScenariosPage';
import BotWorkspaceAnalyticsPage from './features/dashboard/botWorkspace/BotWorkspaceAnalyticsPage';
import BotWorkspaceSettingsPage from './features/dashboard/botWorkspace/BotWorkspaceSettingsPage';
import CrmKnowledgeGuidePage from './pages/help/CrmKnowledgeGuidePage';
function CrmLegacyUsersList() {
  const { botId } = useParams();
  const loc = useLocation();
  return <Navigate to={`/dashboard/bots/${botId}/crm/contacts${loc.search}`} replace />;
}

function CrmLegacyUserDetail() {
  const { botId, ctorUserId } = useParams();
  const loc = useLocation();
  return (
    <Navigate to={`/dashboard/bots/${botId}/crm/contacts/${ctorUserId}${loc.search}`} replace />
  );
}

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
          <Route path="market/items/:id" element={<MarketItemDetailPage />} />
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
              /editor/:id → редактор рабочего пространства бота
              /editor/scenario/:scenarioId → редактор самостоятельного сценария */}
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
          <Route
            path="editor/scenario/:scenarioId"
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
            <Route path="scenarios/:scenarioId" element={<ScenarioDetailPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="balance" element={<BalancePage />} />
            <Route path="tariff" element={<TariffLimitsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="bf-team" element={<BFTeamPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="help/crm" element={<CrmKnowledgeGuidePage />} />

            <Route path="bots/:botId" element={<BotWorkspaceLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<BotWorkspaceOverviewPage />} />
              <Route path="scenarios" element={<BotWorkspaceScenariosPage />} />
              <Route path="analytics" element={<BotWorkspaceAnalyticsPage />} />
              <Route path="settings" element={<BotWorkspaceSettingsPage />} />
              <Route path="crm" element={<BotCrmLayout />}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<BotCrmOverviewPage />} />
                <Route path="contacts" element={<BotCrmContactsPage />} />
                <Route path="contacts/:ctorUserId" element={<BotCrmContactDetailPage />} />
                <Route path="fields" element={<BotCrmFieldsPage />} />
                <Route path="tags" element={<BotCrmTagsPage />} />
                <Route path="statuses" element={<BotCrmStatusesPage />} />
                <Route path="users" element={<CrmLegacyUsersList />} />
                <Route path="users/:ctorUserId" element={<CrmLegacyUserDetail />} />
                <Route path="variables" element={<Navigate to="fields" replace />} />
              </Route>
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
