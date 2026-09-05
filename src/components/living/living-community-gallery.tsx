import { cn } from "@/lib/utils";
import type { LivingCommunityPresentation } from "@/lib/data/living-community";

type CommunityImage = {
  src: string;
  label: string;
  alt: string;
};

export function LivingCommunityGallery({
  community,
  className,
}: {
  community: LivingCommunityPresentation;
  className?: string;
}) {
  const primary: CommunityImage | null = community.courtyardImageUrl
    ? {
        src: community.courtyardImageUrl,
        label: "Community courtyard",
        alt: `${community.displayName} landscaped resident courtyard`,
      }
    : community.lobbyImageUrl
      ? {
          src: community.lobbyImageUrl,
          label: "Resident lounge",
          alt: `${community.displayName} resident lounge`,
        }
      : null;

  const secondary = [
    community.lobbyImageUrl && community.lobbyImageUrl !== primary?.src
      ? {
          src: community.lobbyImageUrl,
          label: "Resident lounge",
          alt: `${community.displayName} resident lounge`,
        }
      : null,
    community.modelHomeImageUrl
      ? {
          src: community.modelHomeImageUrl,
          label: "A look inside",
          alt: `${community.displayName} model apartment interior`,
        }
      : null,
  ].filter((image): image is CommunityImage => Boolean(image));

  if (!primary && !secondary.length) return null;

  return (
    <section aria-labelledby="living-community-gallery-title" className={cn("space-y-4", className)}>
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h2 id="living-community-gallery-title" className="text-base font-semibold tracking-[-0.015em]">
            Around {community.displayName}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A few familiar spaces around your community.
          </p>
        </div>
        {community.amenities.length ? (
          <p className="text-xs text-muted-foreground">
            {community.amenities.slice(0, 3).join(" · ")}
          </p>
        ) : null}
      </header>

      <div className="grid min-h-72 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
        {primary ? (
          <CommunityPhoto image={primary} className="min-h-72 lg:min-h-[370px]" />
        ) : null}

        {secondary.length ? (
          <div className={cn("grid gap-3", primary ? "grid-rows-2" : "sm:grid-cols-2 lg:grid-cols-2")}>
            {secondary.map((image) => (
              <CommunityPhoto key={image.src} image={image} className="min-h-40" />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CommunityPhoto({
  image,
  className,
}: {
  image: CommunityImage;
  className?: string;
}) {
  return (
    <figure className={cn("group relative isolate overflow-hidden rounded-[1rem] bg-muted", className)}>
      <img
        src={image.src}
        alt={image.alt}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(7,24,18,.62)_100%)]" />
      <figcaption className="absolute inset-x-0 bottom-0 px-4 py-3 text-sm font-medium text-white sm:px-5 sm:py-4">
        {image.label}
      </figcaption>
    </figure>
  );
}
