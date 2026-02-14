import { Outlet } from 'react-router-dom';
import AppSidebar, { MobileNav } from './AppSidebar';
import ReferralBanner from './ReferralBanner';

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-background dot-grid-bg">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <ReferralBanner />
        <MobileNav />
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
