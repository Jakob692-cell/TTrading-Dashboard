import type { ReactNode } from 'react';
import { AppStoreProvider, useStore } from './state/AppStore';
import { UiProvider, useUi } from './state/Ui';
import { NavigatorProvider, useNav, type Route, type Tab } from './navigation/Navigator';
import { TabBar } from './components/navigation/TabBar';
import { Icon } from './components/ui/Icon';
import { LogoMark } from './components/brand/Logo';
import { CravingSheet } from './features/craving/CravingSheet';
import { Onboarding } from './screens/onboarding/Onboarding';
import { HomeScreen } from './screens/HomeScreen';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { DeviceScreen } from './screens/DeviceScreen';
import { FlavorsScreen } from './screens/FlavorsScreen';
import { AchievementsScreen } from './screens/AchievementsScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { AboutScreen, AccountScreen, HelpScreen, PrivacyScreen } from './screens/InfoScreens';

const TAB_SCREENS: Record<Tab, () => ReactNode> = {
  home: () => <HomeScreen />,
  stats: () => <StatisticsScreen />,
  goals: () => <GoalsScreen />,
  profile: () => <ProfileScreen />,
};

const ROUTE_SCREENS: Record<Route['name'], () => ReactNode> = {
  device: () => <DeviceScreen />,
  flavors: () => <FlavorsScreen />,
  achievements: () => <AchievementsScreen />,
  notifications: () => <NotificationsScreen />,
  insights: () => <InsightsScreen />,
  privacy: () => <PrivacyScreen />,
  account: () => <AccountScreen />,
  help: () => <HelpScreen />,
  about: () => <AboutScreen />,
};

function MainApp() {
  const nav = useNav();
  const { openCraving } = useUi();
  const route = nav.top;
  const anim = nav.direction === 'push' ? 'anim-push' : nav.direction === 'pop' ? 'anim-pop' : 'anim-fade';
  const showFab = !route && nav.tab !== 'profile';

  return (
    <>
      <main key={nav.key} className={`screen ${route ? 'screen--pushed' : ''} ${anim}`}>
        {route ? ROUTE_SCREENS[route.name]() : TAB_SCREENS[nav.tab]()}
      </main>
      {showFab && (
        <button type="button" className="fab" onClick={openCraving}>
          <Icon name="wave" size={20} strokeWidth={1.8} style={{ color: 'var(--accent-strong)' }} />
          Craving?
        </button>
      )}
      <TabBar />
      <CravingSheet />
    </>
  );
}

function Root() {
  const { state } = useStore();
  if (state.status === 'loading' || !state.data?.user) {
    return (
      <div className="splash" aria-label="Loading NoVape">
        {state.status === 'error' ? <p className="muted">Something went wrong. Please reload.</p> : <LogoMark size={56} animated />}
      </div>
    );
  }
  if (!state.data.user.onboardingCompleted) return <Onboarding />;
  return (
    <NavigatorProvider>
      <MainApp />
    </NavigatorProvider>
  );
}

export default function App() {
  return (
    <div className="stage">
      <div className="shell">
        <AppStoreProvider>
          <UiProvider>
            <Root />
          </UiProvider>
        </AppStoreProvider>
      </div>
    </div>
  );
}
