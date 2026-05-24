// IndexedDB storage for video files — persists across page refreshes

const DB_NAME = "studio_videos";
const STORE = "blobs";
const HANDLES_STORE = "handles";
const VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(HANDLES_STORE)) db.createObjectStore(HANDLES_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveVideoBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getVideoBlob(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => {
      if (req.result) {
        resolve(URL.createObjectURL(req.result));
      } else {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
  });
}

export async function deleteVideoBlob(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export function isIndexedDBKey(url: string): boolean {
  return url.startsWith("idb:");
}

export function isFSAKey(url: string): boolean {
  return url.startsWith("fsa:");
}

export async function saveFileHandle(key: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLES_STORE, "readwrite");
    tx.objectStore(HANDLES_STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFileHandle(key: string): Promise<FileSystemFileHandle | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction(HANDLES_STORE).objectStore(HANDLES_STORE).get(key);
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle) || null);
    req.onerror = () => resolve(null);
  });
}

export async function deleteFileHandle(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(HANDLES_STORE, "readwrite");
    tx.objectStore(HANDLES_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
