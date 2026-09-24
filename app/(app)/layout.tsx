import { requireAuth } from "@/lib/auth";
import { SidebarNav, TabBar } from "@/components/Nav";
import { Mark } from "@/components/landing/pieces";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  const workspaceName = auth.workspace.company_name || auth.workspace.name;

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div className="px-5 pb-8 pt-7">
          <Link href="/dashboard" className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.03em]">
            <Mark className="h-5 w-5" /> AI SDR
          </Link>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">Workspace</p>
          <p className="truncate text-[15px] font-medium">{workspaceName}</p>
        </div>
        <SidebarNav />
        <div className="mt-auto border-t border-line px-5 py-4">
          <p className="truncate font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">{auth.email}</p>
          <form action="/auth/signout" method="post" className="mt-1">
            <button className="font-mono text-[12px] uppercase tracking-[0.04em] text-ink hover:text-accent">
              <span className="text-accent">→</span> Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Header (mobile) */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-chrome px-4 py-3 backdrop-blur-md md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.03em]">
          <Mark className="h-5 w-5" /> AI SDR
        </Link>
        <form action="/auth/signout" method="post">
          <button className="font-mono text-[11px] uppercase tracking-[0.04em] text-ink-2">Sign out</button>
        </form>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-8 md:px-10 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <TabBar />
    </div>
  );
}
