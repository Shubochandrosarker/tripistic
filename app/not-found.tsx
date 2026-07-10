import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Compass className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        The page you are looking for doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <div className="mt-6 flex gap-2">
        <ButtonLink href="/dashboard" variant="primary">
          Go to dashboard
        </ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Home
        </ButtonLink>
      </div>
    </div>
  );
}
