import Link from "next/link";

/** The product mark: the Theron "T". */
export function Mark({ className = "h-6 w-6" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- small static brand asset
  return <img src="/brand/theron-mark.png" alt="" width={512} height={512} className={`object-contain ${className}`} aria-hidden />;
}

/** The full Theron wordmark (mark + name). Dark lettering, for light backgrounds. */
export function Wordmark({ className = "h-7 w-auto" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- small static brand asset
  return <img src="/brand/theron-wordmark.png" alt="Theron" width={604} height={160} className={className} />;
}

export function Logo({ light = false }: { light?: boolean }) {
  // The wordmark's lettering is dark, so on dark backgrounds show the mark with light text instead.
  return (
    <Link href="/" className={`flex items-center gap-2 text-[22px] font-semibold tracking-[-0.03em] ${light ? "text-[#f1f0ed]" : ""}`}>
      {light ? (
        <>
          <Mark className="h-7 w-7" />
          Theron
        </>
      ) : (
        <Wordmark className="h-8 w-auto" />
      )}
    </Link>
  );
}

/** Numbered section tag: orange number block + label block. */
export function Tag({ n, children, dark = false }: { n: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <span className="lp-mono inline-flex text-[15px] font-medium">
      <span className="bg-[var(--lp-orange)] px-2.5 py-2 text-white">{n}</span>
      <span className={`px-3.5 py-2 ${dark ? "bg-white/10 text-[#f1f0ed]" : "bg-black/[0.07]"}`}>{children}</span>
    </span>
  );
}

/** Crosshair marker where guide lines meet. */
export function Plus({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" className={`pointer-events-none absolute h-[22px] w-[22px] text-[var(--lp-orange)] ${className}`} aria-hidden>
      <path d="M11 0v22M0 11h22" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Full-bleed section frame that keeps content on the shared 3-column grid. */
export function Frame({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`relative scroll-mt-20 ${className}`}>
      <div className="relative mx-auto max-w-[1800px] px-5 md:px-12">{children}</div>
    </section>
  );
}

export function BlockButton({ href, children, variant = "dark", className = "" }: { href: string; children: React.ReactNode; variant?: "dark" | "light" | "orange"; className?: string }) {
  const styles = {
    dark: "bg-[var(--lp-dark)] text-[#f1f0ed] hover:bg-black",
    light: "bg-white text-[var(--lp-ink)] hover:bg-[#fafaf8]",
    orange: "bg-[var(--lp-orange)] text-white hover:brightness-105",
  }[variant];
  return (
    <Link href={href} className={`lp-mono flex h-[72px] items-center justify-center px-6 text-[17px] font-medium tracking-[0.04em] transition md:h-[86px] md:text-[20px] ${styles} ${className}`}>
      {children}
    </Link>
  );
}

/** Small line icons with an orange detail, drawn for this site. */
const ICONS: Record<string, React.ReactNode> = {
  search: (<><circle cx="20" cy="20" r="11" /><path d="M28 28l9 9" /><rect x="16" y="16" width="8" height="8" className="lp-fill" /></>),
  score: (<><path d="M6 36h32M10 36V24M18 36V16M26 36V20M34 36V8" /><rect x="31" y="5" width="6" height="6" className="lp-fill" /></>),
  mail: (<><rect x="5" y="10" width="34" height="24" /><path d="M5 12l17 12 17-12" /><rect x="30" y="4" width="8" height="8" className="lp-fill" /></>),
  loop: (<><path d="M34 16a13 13 0 1 0 1 10" /><path d="M36 8v9h-9" className="lp-stroke" /></>),
  chat: (<><path d="M5 6h34v22H20l-9 8v-8H5z" /><rect x="18" y="13" width="8" height="8" className="lp-fill" /></>),
  gears: (<><rect x="6" y="6" width="14" height="14" /><rect x="24" y="24" width="14" height="14" /><path d="M20 13h11v11" className="lp-stroke" /></>),
  check: (<><path d="M6 6h8M6 6v8M38 6h-8M38 6v8M6 38h8M6 38v-8M38 38h-8M38 38v-8" /><path d="M14 22l6 6 11-12" className="lp-stroke" /></>),
  clinic: (<><path d="M8 38V12h28v26" /><path d="M22 18v12M16 24h12" className="lp-stroke" /></>),
  agency: (<><rect x="6" y="8" width="32" height="22" /><path d="M16 38l6-8 6 8" /><path d="M12 24l7-7 5 4 8-8" className="lp-stroke" /></>),
  home: (<><path d="M6 20L22 7l16 13v18H6z" /><rect x="18" y="26" width="8" height="12" className="lp-fill" /></>),
  cart: (<><path d="M5 8h5l4 20h20l4-14H13" /><circle cx="16" cy="35" r="2.5" className="lp-fill" /><circle cx="31" cy="35" r="2.5" className="lp-fill" /></>),
  cloud: (<><rect x="6" y="8" width="32" height="22" /><path d="M14 38h16" /><path d="M15 22a4 4 0 0 1 3-7 6 6 0 0 1 11 2 3 3 0 0 1 0 5z" className="lp-stroke" /></>),
  briefcase: (<><rect x="5" y="13" width="34" height="23" /><path d="M16 13V7h12v6" /><rect x="19" y="21" width="6" height="6" className="lp-fill" /></>),
};

export function LineIcon({ name, className = "h-11 w-11" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 44 44" className={`${className} [&_.lp-fill]:fill-[var(--lp-orange)] [&_.lp-fill]:stroke-none [&_.lp-stroke]:stroke-[var(--lp-orange)]`} fill="none" stroke="#9b9a95" strokeWidth="1.6" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}
