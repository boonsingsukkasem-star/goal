import Link from "next/link";

import { GoalLogo } from "@/components/brand/goal-logo";

const legalLinks = [
  { href: "/privacy", label: "ความเป็นส่วนตัว" },
  { href: "/support", label: "ช่วยเหลือ" },
  { href: "/account-deletion", label: "ลบบัญชี" },
] as const;

export function SiteFooter() {
  return (
    <footer className="goal-template-footer border-t border-border bg-[#0d0e12]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-16 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8">
        <GoalLogo className="w-20" />
        <nav
          aria-label="Legal and support"
          className="flex flex-wrap gap-x-6 gap-y-2 font-label text-xs font-bold tracking-[0.12em] uppercase"
        >
          {legalLinks.map((link) => (
            <Link className="transition-colors hover:text-primary" href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="font-label text-xs tracking-[0.08em]">© 2026 GOAL AI FOOTBALL</p>
      </div>
    </footer>
  );
}
