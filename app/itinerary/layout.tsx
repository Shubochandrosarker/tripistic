import Link from "next/link";
import { Compass } from "lucide-react";

export default function ItineraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border print:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Compass className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">Tripistic</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground print:hidden">
        Powered by Tripistic
      </footer>
    </div>
  );
}
