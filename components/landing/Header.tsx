"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo, Plus } from "./pieces";

const LINKS = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#process", label: "How it works" },
  { href: "#industries", label: "Industries" },
  { href: "#faq", label: "FAQ" },
  { href: "/login", label: "Sign in" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="relative mx-auto flex max-w-[1800px] items-start justify-between px-5 pt-5 md:px-12 md:pt-10">
        <div className="pointer-events-auto rounded-sm bg-[var(--lp-bg)]/70 pr-2 backdrop-blur-sm">
          <Logo />
        </div>

        <div className="pointer-events-auto relative flex">
          <Plus className="-left-[11px] -top-[11px] hidden md:block" />
          <Link
            href="/login?mode=signup"
            className="lp-mono hidden h-[66px] w-[340px] items-center justify-center border border-[var(--lp-line)] bg-[var(--lp-bg)]/85 text-[19px] tracking-[0.04em] backdrop-blur-sm transition hover:bg-white md:flex lg:w-[530px]"
          >
            Start free
          </Link>
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="grid h-[56px] w-[56px] place-items-center bg-[var(--lp-dark)] text-white md:h-[66px] md:w-[68px]"
          >
            <span className="flex w-8 flex-col gap-[7px]" aria-hidden>
              <span className="h-[2px] bg-current" />
              <span className="h-[2px] bg-current" />
            </span>
          </button>

          {open && (
            <div className="absolute right-0 top-0 w-[min(92vw,600px)]" role="dialog" aria-label="Menu">
              <Plus className="-left-[11px] -top-[11px]" />
              <nav className="lp-grain min-h-[420px] px-8 pb-10 pt-24">
                <ul className="space-y-3">
                  {LINKS.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} onClick={() => setOpen(false)} className="lp-mono text-[22px] font-medium tracking-[0.02em] text-[#f1f0ed] hover:text-[var(--lp-orange)]">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/login?mode=signup" onClick={() => setOpen(false)} className="lp-mono mt-12 flex h-16 items-center justify-center bg-[var(--lp-orange)] text-[18px] tracking-[0.04em] text-white">
                  Start free
                </Link>
              </nav>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="absolute right-0 top-0 grid h-[56px] w-[56px] place-items-center border border-white/60 bg-[var(--lp-dark)] text-white md:h-[66px] md:w-[68px]"
              >
                <svg viewBox="0 0 24 24" className="h-7 w-7" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M5 5l14 14M19 5L5 19" /></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
