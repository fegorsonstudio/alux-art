import React from "react";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string | null | undefined;
  preferredWidth?: number; // default 600
  preferredQuality?: number; // default 75
};

function addParams(src: string, width: number, quality: number, fmt = "webp") {
  if (!src) return src;
  const sep = src.includes("?") ? "&" : "?";
  return `${src}${sep}width=${width}&quality=${quality}&format=${fmt}`;
}

export default function ImagePreview({ src, alt = "", className, preferredWidth = 600, preferredQuality = 75, sizes, ...rest }: Props) {
  if (!src) {
    return <img src={src as any} alt={alt} className={className} loading="lazy" decoding="async" {...rest} />;
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
      {...rest}
    />
  );
}
