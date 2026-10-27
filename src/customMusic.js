// User-supplied music lives only in this browser/device. IndexedDB is used because audio files
// are much larger than localStorage and should survive normal reloads without uploading anywhere.
const DB = 'bangers-smash-user-media', STORE = 'music', KEY = 'custom';

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomMusic(file) {
  const d = await db();
  await new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ blob: file, name: file.name || 'Custom music', type: file.type || '', saved: Date.now() }, KEY);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
  d.close();
}

export async function getCustomMusic() {
  const d = await db();
  const value = await new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
  });
  d.close();
  return value;
}
