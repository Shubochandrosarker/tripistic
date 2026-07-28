import Link from "next/link";
import type { CSSProperties } from "react";
import { Compass, MapPin } from "lucide-react";
import { TOUR_KIND_LABELS, type TourKindValue } from "@/lib/constants";
import type { StorefrontDraft } from "@/lib/storefront/schema";
import { formatDuration, formatMoney } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

type PublicTour = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  durationMinutes: number;
  location: string | null;
  basePrice: number;
  currency: string;
  coverImageUrl: string | null;
};

export function PublicStorefront({
  workspace,
  storefront,
  tours,
  tourHref,
}: {
  workspace: { name: string };
  storefront: StorefrontDraft;
  tours: PublicTour[];
  tourHref: (tourSlug: string) => string;
}) {
  const heroImage = storefront.hero.imageUrl ?? tours.find((tour) => tour.coverImageUrl)?.coverImageUrl ?? null;
  const themeStyle = {
    "--storefront-primary": storefront.brand.primaryColor,
    "--storefront-secondary": storefront.brand.secondaryColor,
    "--storefront-accent": storefront.brand.accentColor,
    "--storefront-surface": storefront.brand.surfaceColor,
    "--storefront-text": storefront.brand.textColor,
  } as CSSProperties;

  return (
    <div className="space-y-10" style={themeStyle}>
      <section className="overflow-hidden rounded-xl border border-border bg-[var(--storefront-surface)] text-[var(--storefront-text)]">
        <div className="grid min-h-[360px] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
            {storefront.brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- workspace media is managed by Tripistic object storage.
              <img src={storefront.brand.logoUrl} alt={`${storefront.brand.brandName} logo`} className="max-h-14 w-fit max-w-56 object-contain" />
            ) : null}
            {storefront.hero.eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--storefront-primary)]">{storefront.hero.eyebrow}</p>
            ) : null}
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold sm:text-5xl">{storefront.hero.title}</h1>
              {storefront.hero.subtitle ? <p className="max-w-2xl text-base opacity-80 sm:text-lg">{storefront.hero.subtitle}</p> : null}
            </div>
            <a
              href="#tours"
              className="inline-flex h-10 w-fit items-center justify-center rounded-lg bg-[var(--storefront-primary)] px-4 text-sm font-medium text-white"
            >
              {storefront.hero.primaryCta}
            </a>
          </div>
          <div className="min-h-72 bg-muted">
            {heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- workspace media is managed by Tripistic object storage.
              <img src={heroImage} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Compass className="size-10 text-muted-foreground" aria-hidden />
              </div>
            )}
          </div>
        </div>
      </section>

      {tours.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No public tours available right now"
          description="This operator hasn't published any bookable experiences yet. Check back soon."
        />
      ) : (
        <section id="tours" className="space-y-4">
          {storefront.pages.home.enabled ? (
            <div className="max-w-3xl space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">{storefront.pages.home.title}</h2>
              {storefront.pages.home.body ? <p className="text-sm text-muted-foreground">{storefront.pages.home.body}</p> : null}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {tours.map((tour) => (
              <Link
                key={tour.id}
                href={tourHref(tour.slug)}
                className="group overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-shadow hover:shadow-md"
              >
                <div className="flex aspect-[16/9] items-center justify-center overflow-hidden bg-muted">
                  {tour.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- workspace-supplied image URL.
                    <img
                      src={tour.coverImageUrl}
                      alt=""
                      className="size-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <Compass className="size-8 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="space-y-1 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-accent">
                    {TOUR_KIND_LABELS[tour.kind as TourKindValue] ?? tour.kind}
                  </p>
                  <h2 className="font-semibold text-foreground">{tour.title}</h2>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>{formatDuration(tour.durationMinutes)}</span>
                    {tour.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden /> {tour.location}
                      </span>
                    ) : null}
                  </p>
                  <p className="pt-1 text-sm font-semibold text-foreground">
                    From {formatMoney(tour.basePrice, tour.currency)}
                    <span className="font-normal text-muted-foreground"> / guest</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {storefront.pages.about.enabled ? (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">{storefront.pages.about.title}</h2>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{storefront.pages.about.body || `${workspace.name} publishes direct booking experiences through Tripistic.`}</p>
          </section>
        ) : null}
        {storefront.pages.faq.enabled ? (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">{storefront.pages.faq.title}</h2>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{storefront.pages.faq.body || "Contact the operator for trip-specific questions before booking."}</p>
          </section>
        ) : null}
        {storefront.pages.policies.enabled ? (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">{storefront.pages.policies.title}</h2>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{storefront.pages.policies.body}</p>
          </section>
        ) : null}
      </div>

      {storefront.pages.contact.enabled ? (
        <section className="border-t border-border pt-6 text-sm text-muted-foreground">
          <h2 className="mb-2 text-lg font-semibold text-foreground">Contact</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {storefront.pages.contact.email ? <a href={`mailto:${storefront.pages.contact.email}`}>{storefront.pages.contact.email}</a> : null}
            {storefront.pages.contact.phone ? <span>{storefront.pages.contact.phone}</span> : null}
            {storefront.pages.contact.address ? <span>{storefront.pages.contact.address}</span> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
