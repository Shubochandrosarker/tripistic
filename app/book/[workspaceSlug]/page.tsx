import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPublishedStorefrontBySlug } from "@/lib/storefront/service";
import { PublicStorefront } from "@/components/storefront/public-storefront";

type Params = { params: Promise<{ workspaceSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const found = await getPublishedStorefrontBySlug(workspaceSlug);
  if (!found) return { title: "Not found" };
  return {
    title: found.published.seo.title,
    description: found.published.seo.description,
    openGraph: {
      title: found.published.seo.title,
      description: found.published.seo.description,
      images: found.published.seo.socialImageUrl ? [found.published.seo.socialImageUrl] : [],
    },
  };
}

export default async function WorkspaceBookingPage({ params }: Params) {
  const { workspaceSlug } = await params;
  const found = await getPublishedStorefrontBySlug(workspaceSlug);
  if (!found) notFound();

  const tours = await prisma.tour.findMany({
    where: { workspaceId: found.workspace.id, status: "active", visibility: "public", deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <PublicStorefront
      workspace={found.workspace}
      storefront={found.published}
      tours={tours}
      tourHref={(tourSlug) => `/book/${found.workspace.slug}/${tourSlug}`}
    />
  );
}
