import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Compass, MapPin } from "lucide-react";
import { prisma } from "@/lib/db";
import { TOUR_KIND_LABELS, type TourKindValue } from "@/lib/constants";
import { formatDuration, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

type Params = { params: Promise<{ workspaceSlug: string }> };

async function getWorkspace(slug: string) {
  return prisma.workspace.findFirst({ where: { slug, status: "active", deletedAt: null } });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspace(workspaceSlug);
  return { title: workspace ? `Book with ${workspace.name}` : "Not found" };
}

export default async function WorkspaceBookingPage({ params }: Params) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspace(workspaceSlug);
  if (!workspace) notFound();

  const tours = await prisma.tour.findMany({
    where: { workspaceId: workspace.id, status: "active", visibility: "public", deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHeader title={workspace.name} description="Choose an experience to see dates, prices, and book directly." />

      {tours.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No public tours available right now"
          description="This operator hasn't published any bookable experiences yet. Check back soon."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tours.map((tour) => (
            <Link
              key={tour.id}
              href={`/book/${workspace.slug}/${tour.slug}`}
              className="group overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-shadow hover:shadow-md"
            >
              <div className="flex aspect-[16/9] items-center justify-center overflow-hidden bg-muted">
                {tour.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external, workspace-supplied URLs; no remote domains are allow-listed for next/image yet.
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
      )}
    </>
  );
}
