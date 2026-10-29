import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "loci_images_v1";
const STORE_NAME = "images";

export interface StoredImage {
  id: string;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  createdAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/** Resizes image to max 1600px on the longest side and compresses to WebP/JPEG ~0.8 */
export async function processImageFile(fileOrBlob: Blob): Promise<{ blob: Blob; width: number; height: number; mime: string }> {
  if (typeof document === "undefined") {
    return {
      blob: fileOrBlob,
      width: 800,
      height: 600,
      mime: fileOrBlob.type || "image/jpeg",
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const MAX_SIZE = 1600;

      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ blob: fileOrBlob, width: img.width, height: img.height, mime: fileOrBlob.type || "image/jpeg" });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const mime = "image/webp";
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, width, height, mime: "image/webp" });
          } else {
            // fallback
            canvas.toBlob(
              (jpgBlob) => {
                resolve({
                  blob: jpgBlob || fileOrBlob,
                  width,
                  height,
                  mime: jpgBlob ? "image/jpeg" : fileOrBlob.type,
                });
              },
              "image/jpeg",
              0.8,
            );
          }
        },
        mime,
        0.8,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to process image file"));
    };

    img.src = url;
  });
}

export async function saveLociImage(fileOrBlob: Blob): Promise<{ id: string; width: number; height: number }> {
  const db = await getDB();
  const processed = await processImageFile(fileOrBlob);
  const id = "img_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const record: StoredImage = {
    id,
    blob: processed.blob,
    mime: processed.mime,
    width: processed.width,
    height: processed.height,
    createdAt: new Date().toISOString(),
  };
  await db.put(STORE_NAME, record);
  return { id, width: processed.width, height: processed.height };
}

export async function getLociImage(id: string): Promise<StoredImage | null> {
  try {
    const db = await getDB();
    const record = await db.get(STORE_NAME, id);
    return record || null;
  } catch {
    return null;
  }
}

/* Note: there is deliberately no getLociImageUrl() here. Returning a bare object
   URL leaves no owner responsible for revoking it, which leaked one blob per
   photo view. Components use the useLociImage() hook, which revokes on unmount. */

export async function deleteLociImage(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
  } catch {
    // ignore
  }
}

export async function getLociStorageUsage(): Promise<{ count: number; bytes: number }> {
  try {
    const db = await getDB();
    const all = await db.getAll(STORE_NAME);
    let bytes = 0;
    for (const item of all) {
      if (item.blob) {
        bytes += item.blob.size;
      }
    }
    return { count: all.length, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export async function clearAllLociImages(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch {
    // ignore
  }
}

/** Convert Stored Image Blob to Base64 data URL for export */
export async function imageBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Convert Base64 data URL back to Blob and store in IndexedDB */
export async function importLociImageFromBase64(dataUrl: string, idHint?: string): Promise<string> {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  const blob = new Blob([u8arr], { type: mime });
  const db = await getDB();
  const id = idHint || "img_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  await db.put(STORE_NAME, {
    id,
    blob,
    mime,
    width: 800,
    height: 600,
    createdAt: new Date().toISOString(),
  });
  return id;
}
