import type { LeadStatus, Priority } from "@/lib/types";

/** Page title: a mono eyebrow over a large grotesk heading. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div className="min-w-0">
        <h1 className="lp-display text-[40px] md:text-[56px]">{title}</h1>
        {subtitle && <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.04em] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-high text-white",
  medium: "bg-accent-soft text-accent",
  low: "bg-fill text-ink-2",
};

/** Square mono badge. Priority is always spelled out, never colour alone. */
export function PriorityBadge({ priority, score }: { priority: Priority; score?: number }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap font-mono text-[11px] font-medium uppercase tracking-[0.04em] ${PRIORITY_STYLE[priority]}`}>
      <span className="px-2 py-1">{priority}</span>
      {score !== undefined && <span className="border-l border-current/20 px-2 py-1 tabular-nums opacity-80">{score}</span>}
    </span>
  );
}

const STATUS_DOT: Record<LeadStatus, string> = {
  new: "bg-accent",
  contacted: "bg-orange",
  replied: "bg-green",
  qualified: "bg-green",
  converted: "bg-green",
  lost: "bg-ink-3",
  unsubscribed: "bg-danger",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.04em] text-ink-2">
      <span className={`h-2 w-2 ${STATUS_DOT[status]}`} aria-hidden />
      {status}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card px-6 py-16 text-center">
      <p className="lp-display text-[28px]">{title}</p>
      {children && <div className="mx-auto mt-3 max-w-md text-[15px] text-ink-2">{children}</div>}
    </div>
  );
}
