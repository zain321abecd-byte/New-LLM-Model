"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Overview", icon: "overview" },
  { href: "/leads", label: "Leads", icon: "leads" },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/agent", label: "Agent", icon: "agent" },
  { href: "/conversations", label: "Chats", icon: "conversations" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(`${href}/`);
}

/** Desktop sidebar: numbered mono entries; the active one becomes a section tag. */
export function SidebarNav() {
  const isActive = useActive();
  return (
    <nav className="border-t border-line">
      {ITEMS.map((item, i) => {
        const active = isActive(item.href);
        const n = String(i + 1).padStart(2, "0");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-stretch border-b border-line font-mono text-[13px] uppercase tracking-[0.04em] transition-colors ${
              active ? "text-ink" : "text-ink-2 hover:bg-fill hover:text-ink"
            }`}
          >
            <span className={`grid w-12 shrink-0 place-items-center py-3.5 font-medium ${active ? "bg-accent text-accent-ink" : "text-ink-3"}`}>{n}</span>
            <span className={`flex flex-1 items-center px-4 ${active ? "bg-fill font-medium" : ""}`}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile tab bar: sharp, mono, orange rule over the active tab. */
export function TabBar() {
  const isActive = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-chrome pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div className="grid grid-cols-6">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-1 pb-2 pt-2.5 font-mono text-[9.5px] uppercase tracking-[0.04em] ${active ? "text-ink" : "text-ink-2"}`}
            >
              {active && <span className="absolute inset-x-3 top-0 h-[2px] bg-accent" aria-hidden />}
              <Icon name={item.icon} className={`h-[22px] w-[22px] ${active ? "text-accent" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
