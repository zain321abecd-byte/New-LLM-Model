import { lpMono, lpSans } from "@/components/landing/fonts";
import { Logo, Plus, Tag } from "@/components/landing/pieces";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className={`lp ${lpSans.variable} ${lpMono.variable} relative min-h-screen overflow-hidden`}>
      <div className="lp-dots absolute inset-x-0 bottom-0 h-[55%]" aria-hidden />
      <div className="relative mx-auto grid min-h-screen max-w-[1800px] px-5 md:grid-cols-3 md:px-12">
        {/* guides */}
        <span className="pointer-events-none absolute inset-y-0 left-5 w-px bg-[var(--lp-line)] md:left-12" aria-hidden />
        <span className="pointer-events-none absolute inset-y-0 right-5 w-px bg-[var(--lp-line)] md:right-12" aria-hidden />

        <div className="flex flex-col justify-between py-8 md:py-10">
          <Logo />
          <p className="lp-mono hidden max-w-[320px] text-[15px] leading-[1.8] md:block">
            Your AI SDR is one message away. Sign in to review leads, drafts and campaigns.
          </p>
        </div>

        <div className="relative flex items-center py-16 md:col-span-2 md:border-l md:border-dashed md:border-[var(--lp-orange)]/70 md:pl-[max(3rem,8%)]">
          <Plus className="-left-[11px] top-24 hidden md:block" />
          <div className="w-full max-w-[520px] bg-[var(--lp-bg)]/80 backdrop-blur-[1px]">
            <Tag n="→">Account</Tag>
            <div className="mt-4">
              <LoginForm initialMode={sp.mode === "signup" ? "signup" : "signin"} next={sp.next} linkError={sp.error === "link"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
