"use client";

import * as React from "react";
import { ArtPlate, type PlateTheme } from "@/components/art/plate";
import { cn } from "@/lib/utils";

/**
 * Provider image (Qloo `properties.image.url`) over the generative plate. The plate
 * stays underneath as the fallback while loading, when there is no URL, or on error.
 */
export function EntityImage({
  src, theme, seed, className, rounded = true, alt = "",
}: { src: string | null | undefined; theme: PlateTheme; seed: string; className?: string; rounded?: boolean; alt?: string }) {
  const [failed, setFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  return (
    <div className={cn("relative overflow-hidden", rounded && "rounded-cc", className)}>
      <ArtPlate theme={theme} seed={seed} rounded={false} className="absolute inset-0" />
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- remote provider host, rendered as-is with a local fallback
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
      {src && !failed && loaded && <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />}
    </div>
  );
}
