import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { navLinks } from "@/lib/marketing/content";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/82 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Compass className="size-4.5" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight text-foreground">Tripistic</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  const groups = [
    {
      title: "Platform",
      links: [
        ["Features", "/features"],
        ["AI Platform", "/ai-platform"],
        ["White Label", "/white-label"],
        ["Customer Portal", "/customer-portal"],
        ["Integrations", "/integrations"],
      ],
    },
    {
      title: "Company",
      links: [
        ["Why Tripistic", "/why-tripistic"],
        ["Customer Stories", "/customers"],
        ["Partners", "/partners"],
        ["Careers", "/careers"],
        ["About", "/about"],
      ],
    },
    {
      title: "Resources",
      links: [
        ["Documentation", "/docs"],
        ["Help Center", "/help"],
        ["Blog", "/blog"],
        ["Changelog", "/changelog"],
        ["Roadmap", "/roadmap"],
      ],
    },
    {
      title: "Sales",
      links: [
        ["Pricing", "/pricing"],
        ["Demo", "/demo"],
        ["Contact", "/contact"],
        ["API", "/developers"],
        ["Register", "/register"],
      ],
    },
  ];

  return (
    <footer className="border-t border-border bg-card/35">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_2fr]">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Compass className="size-4.5" aria-hidden />
            </span>
            <span className="text-base font-semibold tracking-tight text-foreground">Tripistic</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
            The AI-native travel operating system for modern tour operators, agencies,
            DMCs, and enterprise travel brands.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group) => (
            <div key={group.title}>
              <h2 className="text-sm font-semibold text-foreground">{group.title}</h2>
              <ul className="mt-3 space-y-2">
                {group.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-sm text-muted-foreground hover:text-foreground">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Tripistic. AI-native operations for tour businesses.
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
