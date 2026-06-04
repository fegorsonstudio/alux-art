"use client";

import React from "react";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string | null | undefined;
  preferredWidth?: number; // default 600
  preferredQuality?: number; // default 75
};

function addParams(src: string, width: number, quality: number, fmt = "webp") {
  if (!src) return src;
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;
  const sep = src.includes("?") ? "&" : "?";
  return `${src}${sep}width=${width}&quality=${quality}&format=${fmt}`;
}

export default function ImagePreview({
  src,
  alt = "",
  className,
  preferredWidth = 600,
  preferredQuality = 75,
  sizes,
  onError,
  ...rest
}: Props) {
  const [hasError, setHasError] = React.useState(false);

  const handleError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (hasError) {
      return;
    }
    setHasError(true);

    const failedSrc = event.currentTarget?.src || src || "";
    const payload = {
      type: "image_error",
      message: "Image failed to load",
      source: failedSrc.slice(0, 1000),
      page_path: typeof window !== "undefined" ? window.location.pathname : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      timestamp: new Date().toISOString(),
    };

    if (typeof window !== "undefined") {
      fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }

    if (typeof onError === "function") {
      onError(event);
    }
  };

  if (!src || hasError) {
    return (
      <div
        className={className}
        role="img"
        aria-label="Preview unavailable"
        style={{ minHeight: 120, minWidth: 120, width: "100%" }}
      />
    );
  }

  const w1 = Math.min(320, preferredWidth);
  const w2 = preferredWidth;
  const w3 = Math.max(preferredWidth, 900);

  const s1 = addParams(src, w1, preferredQuality);
  const s2 = addParams(src, w2, preferredQuality);
  const s3 = addParams(src, w3, preferredQuality);

  const srcSet = `${s1} ${w1}w, ${s2} ${w2}w, ${s3} ${w3}w`;
  const sizesAttr = sizes ?? `(max-width: ${preferredWidth}px) 100vw, ${preferredWidth}px`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={s2}
      srcSet={srcSet}
      sizes={sizesAttr}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={handleError}
      {...rest}
    />
  );
}
