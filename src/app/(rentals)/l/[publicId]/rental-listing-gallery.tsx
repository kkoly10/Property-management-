"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

export function RentalListingGallery({ photos, title }: {
  photos: { url: string | null; altText: string }[];
  title: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activePhoto = photos[activeIndex] ?? photos[0];

  return (
    <section aria-label="Rental photos">
      <div className="aspect-[4/3] max-h-[430px] overflow-hidden rounded-2xl border bg-muted sm:aspect-[16/9]">
        {activePhoto?.url ? (
          // The media route checks listing visibility and the approved photo on every request.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={activePhoto.url} alt={activePhoto.altText || title}
            className="h-full max-h-[430px] w-full object-cover" fetchPriority="high" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ImageOff aria-hidden="true" className="size-5" />
            Photo unavailable
          </div>
        )}
      </div>
      {photos.length > 1 ? (
        <div className="mt-2 flex gap-2 overflow-x-auto rounded-md px-1 pb-1 pt-1">
          {photos.map((photo, index) => photo.url ? (
            <button key={photo.url} type="button" aria-label={`Show photo ${index + 1}${photo.altText ? `: ${photo.altText}` : ""}`}
              aria-pressed={index === activeIndex} onClick={() => setActiveIndex(index)}
              className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-transparent aria-pressed:ring-2 aria-pressed:ring-primary sm:h-16 sm:w-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="size-full object-cover" loading="lazy" />
            </button>
          ) : null)}
        </div>
      ) : null}
    </section>
  );
}
