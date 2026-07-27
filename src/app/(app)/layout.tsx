import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';

/* (app) 路由组：受保护的工作台页面统一套鉴权门 + 外壳布局。 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
