import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { lpMono, lpSans } from "@/components/landing/fonts";
import { Header } from "@/components/landing/Header";
import { BlockButton, Frame, LineIcon, Logo, Mark, Plus, Tag } from "@/components/landing/pieces";

/* Shared column guides: page edges, the orange dashed guide at 1/3, and 2/3. */
function Guides() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      <div className="relative mx-auto h-full max-w-[1800px] px-5 md:px-12">
        <div className="relative h-full">
          <span className="absolute inset-y-0 left-0 w-px bg-[var(--lp-line)]" />
          <span className="absolute inset-y-0 right-0 w-px bg-[var(--lp-line)]" />
          <span className="absolute inset-y-0 left-1/3 hidden w-px border-l border-dashed border-[var(--lp-orange)]/70 md:block" />
          <span className="absolute inset-y-0 left-2/3 hidden w-px bg-[var(--lp-line)] md:block" />
        </div>
      </div>
    </div>
  );
}

/** Section heading row: tag + title in one column, a full-bleed rule underneath. */
function SectionHead({ n, tag, title, dark = false, offset = false }: { n: string; tag: string; title: React.ReactNode; dark?: boolean; offset?: boolean }) {
  return (
    <div className={`relative border-b ${dark ? "border-[var(--lp-line-dark)]" : "border-[var(--lp-line)]"}`}>
      <div className="relative mx-auto max-w-[1800px] px-5 md:px-12">
        <div className={`relative pb-6 pt-24 md:pb-8 md:pt-40 ${offset ? "md:pl-[33.333%]" : ""}`}>
          <Tag n={n} dark={dark}>{tag}</Tag>
          <h2 className="lp-display mt-4 text-[44px] md:text-[64px]">{title}</h2>
          <Plus className="-bottom-[11px] left-[calc(33.333%-11px)] hidden md:block" />
        </div>
      </div>
    </div>
  );
}

function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`relative border-b border-dashed border-[var(--lp-line)] ${className}`}>{children}</div>;
}

const STEPS = [
  { n: "01", title: "Send a command\non WhatsApp", icon: "chat" as const },
  { n: "02", title: "Agent researches\n& enriches leads", icon: "search" as const },
  { n: "03", title: "Review the scored\nleads & drafts", icon: "score" as const },
  { n: "04", title: "Reply YES,\nit sends", icon: "check" as const },
];

const INDUSTRIES = [
  { icon: "clinic", label: "Clinics & healthcare", cmd: "Find 40 dental clinics in Austin" },
  { icon: "agency", label: "Agencies", cmd: "Find marketing agencies hiring SDRs" },
  { icon: "home", label: "Real estate", cmd: "Find brokerages in Miami with 10+ agents" },
  { icon: "cart", label: "E-commerce", cmd: "Find Shopify stores selling pet supplies" },
  { icon: "cloud", label: "SaaS", cmd: "Find B2B SaaS founders in Berlin" },
  { icon: "briefcase", label: "Professional services", cmd: "Find accounting firms in Chicago" },
] as const;

const STACK = [
  { name: "WhatsApp", x: 50, y: 6 },
  { name: "Claude", x: 16, y: 22 },
  { name: "Apollo", x: 84, y: 24 },
  { name: "Google Maps", x: 12, y: 56 },
  { name: "Hunter", x: 90, y: 56 },
  { name: "Resend", x: 20, y: 88 },
  { name: "Supabase", x: 80, y: 88 },
];

const FAQ = [
  ["What does the agent actually do?", "You send it a plain-language command. It searches Google, Google Maps and B2B databases, visits company websites, finds decision makers and business emails, scores every lead 0–100, saves them to your CRM, and writes personalised outreach and follow-ups."],
  ["Will it send anything without me?", "No. The agent can only stage messages. Nothing goes out until you reply YES, and that check happens in code, not in the AI, so no website or reply can trick it into sending."],
  ["Do I need technical knowledge?", "No. If you can send a WhatsApp message, you can use it. The dashboard is there for reviewing leads, editing and exporting."],
  ["Where does the lead data come from?", "Publicly available business information: search results, Google Maps listings, company websites, and providers like Apollo and Hunter when connected. It never invents contacts; missing fields stay empty."],
  ["Is WhatsApp outreach allowed?", "Only to people who opted in, which is Meta's rule, and the system enforces it. For cold outreach the agent uses email, with unsubscribe links and daily limits built in."],
  ["Can I export my leads?", "Yes. Filter and export to CSV from the dashboard at any time. It's your data."],
];

export default async function Home() {
  if (await getAuth()) redirect("/dashboard");

  return (
    <div className={`lp ${lpSans.variable} ${lpMono.variable} relative min-h-screen overflow-x-clip`}>
      <Header />
      <Guides />

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="lp-dots absolute inset-x-0 bottom-0 h-[60%]" aria-hidden />
        <div className="relative mx-auto grid max-w-[1800px] px-5 pt-36 md:px-12 md:pt-56 grid-cols-[minmax(0,1fr)] lg:grid-cols-3">
          <div className="lg:col-span-2 lg:pr-8">
            <h1 className="lp-display text-[42px] sm:text-[72px] lg:text-[96px]">
              Turn one message
              <br />
              into a full
              <br />
              sales pipeline
            </h1>
            <p className="lp-mono mt-10 max-w-[520px] text-[17px] leading-[1.75] md:text-[20px]">
              Theron is an AI SDR in your WhatsApp. It finds leads, qualifies them and writes the outreach. You just say yes.
            </p>
          </div>

          {/* System diagram */}
          <div className="relative mt-10 h-[380px] w-[440px] shrink-0 justify-self-center origin-top scale-[0.72] sm:scale-90 lg:mt-0 lg:scale-[0.7] xl:scale-100" aria-hidden>
            {/* inbound command lines */}
            <svg className="absolute left-0 top-1/2 h-16 w-[26%] -translate-y-1/2" viewBox="0 0 100 60" preserveAspectRatio="none">
              {[10, 30, 50].map((y) => (<g key={y}><path d={`M0 ${y}H96`} stroke="#9b9a95" strokeDasharray="2 3" /><path d={`M92 ${y - 3}l4 3-4 3`} stroke="#9b9a95" fill="none" /></g>))}
            </svg>
            {/* verticals */}
            <span className="absolute left-1/2 top-[64px] h-[66px] border-l border-dotted border-[#9b9a95]" />
            <span className="absolute bottom-[64px] left-1/2 h-[66px] border-l border-dotted border-[#9b9a95]" />
            <span className="absolute left-[calc(50%+95px)] top-1/2 w-[60px] border-t border-dotted border-[#9b9a95]" />
            {/* core */}
            <div className="lp-hatch absolute left-1/2 top-1/2 grid h-[190px] w-[190px] -translate-x-1/2 -translate-y-1/2 place-items-center">
              <div className="relative grid h-[136px] w-[136px] place-items-center bg-white">
                {["left-2 top-2 border-l-2 border-t-2", "right-2 top-2 border-r-2 border-t-2", "bottom-2 left-2 border-b-2 border-l-2", "bottom-2 right-2 border-b-2 border-r-2"].map((c) => (
                  <span key={c} className={`absolute h-3 w-3 border-[var(--lp-orange)] ${c}`} />
                ))}
                <Mark className="h-20 w-20" />
              </div>
            </div>
            {/* output cards */}
            {[
              { cls: "left-1/2 top-0 -translate-x-1/2", icon: "score" as const },
              { cls: "left-[calc(50%+155px)] top-1/2 -translate-y-1/2", icon: "gears" as const },
              { cls: "bottom-0 left-1/2 -translate-x-1/2", icon: "mail" as const },
            ].map((c) => (
              <div key={c.icon} className={`absolute grid h-[64px] w-[58px] place-items-center bg-white [clip-path:polygon(0_0,78%_0,100%_18%,100%_100%,0_100%)] ${c.cls}`}>
                <LineIcon name={c.icon} className="h-7 w-7" />
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto mt-20 grid max-w-[1800px] px-5 pb-16 md:mt-28 md:grid-cols-3 md:px-12">
          <BlockButton href="/login?mode=signup" variant="light" className="md:col-span-1">Start free</BlockButton>
          <BlockButton href="#process" variant="dark" className="md:col-span-2">How it works</BlockButton>
        </div>
      </section>

      {/* ─── 01 Capabilities ──────────────────────────────────────────────── */}
      <div id="capabilities" className="scroll-mt-10 bg-white">
        <SectionHead n="01" tag="Capabilities" title={<>What it handles<br />for you</>} />
        <Frame>
          <div className="grid md:grid-cols-3">
            <div className="py-12 md:pr-10">
              <p className="lp-mono max-w-[340px] text-[16px] leading-[1.8] md:sticky md:top-40">You give the command. The agent does the legwork: research, data entry, first drafts.</p>
            </div>
            <div className="grid sm:grid-cols-2 md:col-span-2">
              {[
                { icon: "search", t: "Lead research\n& discovery" },
                { icon: "score", t: "Enrichment\n& scoring" },
                { icon: "mail", t: "Personal\noutreach" },
                { icon: "loop", t: "Follow-ups\n& replies" },
              ].map((c, i) => (
                <Cell key={c.t} className={`flex min-h-[220px] flex-col justify-between py-10 md:min-h-[340px] ${i % 2 === 1 ? "sm:pl-0" : ""}`}>
                  <LineIcon name={c.icon as "search"} />
                  <p className="lp-mono whitespace-pre-line text-[19px] leading-[1.55] md:text-[21px]">{c.t}</p>
                </Cell>
              ))}
              <div className="flex items-center py-10">
                <p className="lp-mono text-[19px]"><span className="text-[var(--lp-orange)]">+</span> Much more</p>
              </div>
              <div className="flex items-center py-10">
                <BlockButton href="/login?mode=signup" variant="dark" className="w-full">Open the dashboard</BlockButton>
              </div>
            </div>
          </div>
        </Frame>
      </div>

      {/* ─── 02 Process ───────────────────────────────────────────────────── */}
      <div id="process" className="scroll-mt-10">
        <SectionHead n="02" tag="Process" title="How it works" offset />
        <Frame>
          <div className="grid md:grid-cols-3">
            <div className="flex items-center py-12 md:pr-10">
              <p className="lp-mono max-w-[340px] text-[16px] leading-[1.8]">From a one-line message to a qualified, contacted pipeline.</p>
            </div>
            <div className="grid grid-cols-2 md:col-span-2 md:grid-cols-4">
              {STEPS.map((s, i) => (
                <div key={s.n} className={`relative flex min-h-[300px] flex-col pb-12 md:min-h-[420px] ${i > 0 ? "md:border-l md:border-dashed md:border-[var(--lp-line)]" : ""}`}>
                  <span className="lp-mono inline-flex w-fit bg-white px-3 py-3 text-[34px] font-medium tracking-[-0.02em] md:text-[40px]">
                    <span className="text-[var(--lp-orange)]">.</span>{s.n}
                  </span>
                  <p className="lp-mono mt-auto whitespace-pre-line pr-3 text-[16px] leading-[1.6] md:text-[19px]">{s.title}</p>
                  <div className="mt-10 flex items-center">
                    <LineIcon name={s.icon} className="h-14 w-14 shrink-0" />
                    {i < STEPS.length - 1 && <span className="ml-3 hidden flex-1 border-t border-dotted border-[#9b9a95] md:block" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Frame>
      </div>

      {/* ─── 03 Facts ─────────────────────────────────────────────────────── */}
      <div className="bg-[var(--lp-beige)]">
        <SectionHead n="03" tag="Built in" title={<>Built to be<br />trusted</>} />
        <Frame>
          <div className="grid pb-24 md:grid-cols-3">
            <div className="hidden md:block" />
            <div className="md:col-span-2">
              {[
                ["7", "Research & CRM tools\nthe agent chooses from"],
                ["0–100", "Lead score, explained\npoint by point"],
                ["1", "Reply, YES, before\nanything is sent"],
                ["24/7", "Working while\nyou sleep"],
              ].map(([big, label]) => (
                <Cell key={big} className="grid grid-cols-2 items-center py-8 md:py-10">
                  <span className="text-[64px] font-medium leading-none tracking-[-0.05em] md:text-[88px]">{big}</span>
                  <span className="lp-mono whitespace-pre-line text-[15px] leading-[1.6] md:text-[19px]">{label}</span>
                </Cell>
              ))}
            </div>
          </div>
        </Frame>
      </div>

      {/* ─── 04 Example ───────────────────────────────────────────────────── */}
      <div className="lp-grain">
        <SectionHead n="04" tag="In action" title="See it work" dark offset />
        <Frame>
          <div className="grid gap-12 pb-28 pt-12 md:grid-cols-3">
            <div className="md:pr-10">
              <h3 className="lp-display text-[40px] md:text-[56px]">One chat.<br />A whole<br />pipeline.</h3>
              <p className="mt-10 max-w-[340px] text-[19px] leading-[1.5] text-[#f1f0ed]/60">
                An example conversation. The agent reports what it found, drafts the messages, and waits for your go-ahead.
              </p>
            </div>
            <div className="space-y-3 md:col-span-2 md:pl-10">
              {[
                { me: true, t: "Find 30 dental clinics in Austin, TX" },
                { me: false, t: "Found 34 clinics and saved 30. 9 are high priority, with the owner's email for 7. Top pick: Lakeline Family Dental. Want me to write outreach?" },
                { me: true, t: "Yes, emails for the high priority ones" },
                { me: false, t: "9 personalised emails drafted. Reply YES to send, or NO to cancel." },
                { me: true, t: "YES" },
                { me: false, t: "✓ Sent 9 of 9." },
              ].map((m, i) => (
                <div key={i} className={`flex ${m.me ? "justify-end" : ""}`}>
                  <p className={`max-w-[560px] px-5 py-4 text-[17px] leading-[1.5] md:text-[19px] ${m.me ? "lp-mono bg-[var(--lp-orange)] text-white" : "bg-white/[0.07] text-[#f1f0ed]"}`}>
                    {m.t}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Frame>
      </div>

      {/* ─── 05 Industries ────────────────────────────────────────────────── */}
      <div id="industries" className="scroll-mt-10">
        <SectionHead n="05" tag="Markets" title={<>Works in<br />any market</>} />
        <Frame>
          <div className="grid md:grid-cols-3">
            <div className="py-12 md:pr-10">
              <p className="lp-mono max-w-[340px] text-[16px] leading-[1.8]">If your customers are businesses, the agent can find them. Just describe who you sell to.</p>
            </div>
            <div className="grid sm:grid-cols-2 md:col-span-2">
              {INDUSTRIES.map((x) => (
                <Cell key={x.label} className="flex min-h-[190px] flex-col py-0 pb-8">
                  <span className="grid h-[86px] w-[86px] place-items-center bg-white">
                    <LineIcon name={x.icon} className="h-10 w-10" />
                  </span>
                  <p className="lp-mono mt-6 text-[19px] md:text-[21px]">{x.label}</p>
                  <p className="mt-1 text-[16px] text-[var(--lp-ink-2)]">“{x.cmd}”</p>
                </Cell>
              ))}
            </div>
          </div>
        </Frame>
      </div>

      {/* ─── 06 Stack ─────────────────────────────────────────────────────── */}
      <div className="bg-white">
        <SectionHead n="06" tag="Stack" title="Integrations" offset />
        <Frame>
          <div className="grid md:grid-cols-3">
            <div className="py-12 md:pr-10">
              <p className="lp-mono max-w-[340px] text-[16px] leading-[1.8]">Connected to the tools that do the heavy lifting. Plug in the ones you have; the agent uses what's there.</p>
            </div>
            <div className="relative h-[460px] md:col-span-2 md:h-[560px]" aria-label="Integrations: WhatsApp, Claude, Apollo, Google Maps, Hunter, Resend, Supabase">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {STACK.map((s) => <line key={s.name} x1="50" y1="52" x2={s.x} y2={s.y} stroke="#b9b8b3" strokeWidth="0.25" strokeDasharray="0.8 1" vectorEffect="non-scaling-stroke" />)}
              </svg>
              {[[30, 40], [62, 34], [70, 70], [38, 74], [56, 18], [88, 42], [12, 70], [44, 30]].map(([x, y], i) => (
                <span key={i} className={`absolute h-1.5 w-1.5 rounded-full ${i % 3 === 0 ? "bg-[var(--lp-orange)]" : "bg-[#b9b8b3]"}`} style={{ left: `${x}%`, top: `${y}%` }} aria-hidden />
              ))}
              <div className="absolute left-1/2 top-[52%] grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center bg-[var(--lp-bg)]">
                {["left-1.5 top-1.5 border-l-2 border-t-2", "right-1.5 top-1.5 border-r-2 border-t-2", "bottom-1.5 left-1.5 border-b-2 border-l-2", "bottom-1.5 right-1.5 border-b-2 border-r-2"].map((c) => (
                  <span key={c} className={`absolute h-3 w-3 border-[var(--lp-orange)] ${c}`} />
                ))}
                <Mark className="h-11 w-11" />
              </div>
              {STACK.map((s) => (
                <span key={s.name} className="lp-mono absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-white px-2 py-1 text-[14px] text-[var(--lp-ink-2)] md:text-[16px]" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        </Frame>
      </div>

      {/* ─── 07 Value ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="lp-dots absolute inset-x-0 bottom-0 h-1/2" aria-hidden />
        <SectionHead n="07" tag="Value" title={<>Why teams<br />trust it</>} />
        <Frame>
          <div className="grid pb-24 md:grid-cols-3">
            <div className="hidden md:block" />
            <div className="grid sm:grid-cols-2 md:col-span-2">
              {[
                ["01", "Nothing sends\nwithout your YES"],
                ["02", "Real data,\nnever invented"],
                ["03", "Opt-in, unsubscribe\n& daily limits built in"],
                ["04", "Your CRM,\nexport anytime"],
              ].map(([n, t], i) => (
                <Cell key={n} className={`flex min-h-[220px] flex-col justify-between pb-10 md:min-h-[300px] ${i % 2 ? "sm:border-l sm:border-dashed" : ""}`}>
                  <span className="lp-mono inline-flex w-fit bg-white px-3 py-3 text-[34px] font-medium md:text-[40px]"><span className="text-[var(--lp-orange)]">.</span>{n}</span>
                  <p className={`lp-mono whitespace-pre-line text-[19px] leading-[1.55] md:text-[21px] ${i % 2 ? "sm:pl-6" : ""}`}>{t}</p>
                </Cell>
              ))}
            </div>
          </div>
        </Frame>
      </div>

      {/* ─── 08 FAQ ───────────────────────────────────────────────────────── */}
      <div id="faq" className="scroll-mt-10 bg-white">
        <SectionHead n="08" tag="Help" title="FAQ" offset />
        <Frame>
          <div className="grid pb-16 md:grid-cols-3">
            <div className="py-12 md:pr-10">
              <p className="lp-mono max-w-[340px] text-[16px] leading-[1.8]">Everything you need to know before your first command.</p>
            </div>
            <div className="grid md:col-span-2 md:grid-cols-2">
              {FAQ.map(([q, a], i) => (
                <details key={q} className={`group border-b border-dashed border-[var(--lp-line)] ${i % 2 ? "md:border-l md:pl-6" : "md:pr-6"}`}>
                  <summary className="relative flex min-h-[200px] cursor-pointer items-end pb-8 pr-12 pt-16 text-[22px] leading-[1.25] md:text-[26px]">
                    {q}
                    <svg viewBox="0 0 22 22" className="lp-faq-plus absolute right-2 top-8 h-6 w-6 text-[#8a8984] transition-transform" aria-hidden><path d="M11 0v22M0 11h22" stroke="currentColor" strokeWidth="1.3" /></svg>
                  </summary>
                  <p className="-mt-3 pb-8 pr-6 text-[17px] leading-[1.6] text-[var(--lp-ink-2)]">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </Frame>
      </div>

      {/* ─── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative overflow-hidden">
        <div className="lp-dots absolute inset-x-0 top-0 h-[70%]" aria-hidden />
        <div className="relative border-b border-[var(--lp-line)]">
          <div className="relative mx-auto max-w-[1800px] px-5 pb-10 pt-28 md:px-12 md:pt-40">
            <h2 className="lp-display text-[42px] sm:text-[72px] lg:text-[96px]">Put prospecting<br />on autopilot</h2>
          </div>
        </div>
        <div className="relative mx-auto grid max-w-[1800px] gap-12 px-5 py-16 md:grid-cols-3 md:px-12">
          <nav className="lp-mono space-y-3 text-[18px]">
            {[["#capabilities", "Capabilities"], ["#process", "How it works"], ["#industries", "Industries"], ["#faq", "FAQ"], ["/login", "Sign in"]].map(([h, l]) => (
              <Link key={h} href={h} className="block w-fit hover:text-[var(--lp-orange)]">{l}</Link>
            ))}
          </nav>
          <div className="flex flex-col justify-end md:col-span-2 md:pl-10">
            <p className="lp-mono mb-6 text-[15px] text-[var(--lp-ink-2)]">Free to start. Bring your own API keys.</p>
            <BlockButton href="/login?mode=signup" variant="dark">Start free</BlockButton>
          </div>
        </div>
        <div className="relative mx-auto flex max-w-[1800px] items-center justify-between border-t border-[var(--lp-line)] px-5 py-8 md:px-12">
          <Logo />
          <span className="lp-mono text-[13px] text-[var(--lp-ink-2)]">© {new Date().getFullYear()} Theron</span>
        </div>
      </footer>
    </div>
  );
}
