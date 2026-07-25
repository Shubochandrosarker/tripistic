import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

import { CookiePreferencesButton } from "@/components/analytics/cookie-consent";
import { MobileNav } from "@/components/marketing/mobile-nav";
import { NewsletterSignup } from "@/components/marketing/newsletter-signup";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { navLinks } from "@/lib/marketing/content";
import { SITE } from "@/lib/seo/site";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/82 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Tripistic home">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Compass className="size-4.5" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight text-foreground">Tripistic</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Sign in
          </ButtonLink>
          <ButtonLink href="/register" size="sm">
            Start free <ArrowRight className="size-3.5" aria-hidden />
          </ButtonLink>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

const FOOTER_GROUPS: { title: string; links: [string, string][] }[] = [
  {
    title: "Platform",
    links: [
      ["Features", "/features"],
      ["AI Platform", "/ai-platform"],
      ["White Label", "/white-label"],
      ["Customer Portal", "/customer-portal"],
      ["Integrations", "/integrations"],
      ["Solutions", "/solutions"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Documentation", "/docs"],
      ["Help Center", "/help"],
      ["Developers & API", "/developers"],
      ["Blog", "/blog"],
      ["Changelog", "/changelog"],
      ["Roadmap", "/roadmap"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/about"],
      ["Why Tripistic", "/why-tripistic"],
      ["Customer Stories", "/customers"],
      ["Partners", "/partners"],
      ["Careers", "/careers"],
      ["Contact", "/contact"],
    ],
  },
  {
    title: "Sales",
    links: [
      ["Pricing", "/pricing"],
      ["Demo", "/demo"],
      ["Start free", "/register"],
      ["Sign in", "/login"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Legal Center", "/legal"],
      ["Privacy Policy", "/legal/privacy-policy"],
      ["Terms of Service", "/legal/terms-of-service"],
      ["Cookie Policy", "/legal/cookie-policy"],
      ["Security", "/legal/security-policy"],
      ["Accessibility", "/legal/accessibility-statement"],
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card/35">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <NewsletterSignup />

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_2.4fr]">
          <div>
            <Link href="/" className="flex items-center gap-2" aria-label="Tripistic home">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Compass className="size-4.5" aria-hidden />
              </span>
              <span className="text-base font-semibold tracking-tight text-foreground">
                Tripistic
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              The AI-native travel operating system for modern tour operators, agencies, DMCs, and
              enterprise travel brands.
            </p>
            <ul className="mt-5 flex flex-wrap gap-3">
              {SITE.social.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label="Footer" className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            {FOOTER_GROUPS.map((group) => (
              <div key={group.title}>
                <h2 className="text-sm font-semibold text-foreground">{group.title}</h2>
                <ul className="mt-3 space-y-2">
                  {group.links.map(([label, href]) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </div>

      <div className="border-t border-border px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} {SITE.legalName}. AI-native operations for tour businesses.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <CookiePreferencesButton />
            <Link href="/legal/privacy-policy" className="rounded transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/legal/terms-of-service" className="rounded transition-colors hover:text-foreground">
              Terms
            </Link>
            <a href="/llms.txt" className="rounded transition-colors hover:text-foreground">
              llms.txt
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}
