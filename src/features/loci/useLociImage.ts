import { useEffect, useState } from "react";
import { getLociImage } from "../../lib/loci-db";

/* Object URLs created from IndexedDB blobs stay alive until they are revoked.
   Loading a photo per spot during a walk or recall session otherwise leaks one
   URL (and its blob) per step. This hook revokes on change and on unmount, and
   also covers the race where the component unmounts mid-load. */
export function useLociImage(imageId: string | undefined, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageId || !enabled) {
      setUrl(null);
      return;
    }
    let active = true;
    let created: string | null = null;

    getLociImage(imageId)
      .then((record) => {
        if (!record?.blob) return;
        const objectUrl = URL.createObjectURL(record.blob);
        if (!active) {
          // Unmounted while loading: revoke immediately rather than orphan it.
          URL.revokeObjectURL(objectUrl);
          return;
        }
        created = objectUrl;
        setUrl(objectUrl);
      })
      .catch(() => {
        /* A missing or unreadable image falls back to the icon placeholder. */
      });

    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [imageId, enabled]);

  return url;
}
