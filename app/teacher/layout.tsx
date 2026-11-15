import { LiveBridge } from '@/lib/live';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <><LiveBridge role="teacher" />{children}</>;
}
