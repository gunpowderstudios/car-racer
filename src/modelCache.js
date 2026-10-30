// One download per car model, however many cars use it. Every CarVisual used to fetch its own copy of its GLB, so a race with
// several rivals in the same car (and the preload for your own car) downloaded the same file again and again. The bytes are
// fetched once, kept, and each car parses its own scene from a copy (a scene is mutated per car: its paint, its dents, its materials).
const bytes = new Map();      // url -> Promise<ArrayBuffer>

/** Load a model into a fresh scene through the shared download (see modelBytes): `loader` is a GLTFLoader. */
export async function loadGltf(loader, url, onProgress) {
  const buf = await modelBytes(url, onProgress);
  return loader.parseAsync(buf.slice(0), url.slice(0, url.lastIndexOf('/') + 1));
}

/** The model file's bytes, downloaded once. `onProgress(loaded, total)` is called while the first request for it is arriving. */
export function modelBytes(url, onProgress) {
  let p = bytes.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const total = +res.headers.get('content-length') || 0;
      if (!res.body || !onProgress) return res.arrayBuffer();
      const reader = res.body.getReader(), parts = []; let got = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress(got, total); }
      const out = new Uint8Array(got); let o = 0; for (const c of parts) { out.set(c, o); o += c.length; }
      return out.buffer;
    })();
    p.catch(() => { if (bytes.get(url) === p) bytes.delete(url); });      // a failed download is tried again next time
    bytes.set(url, p);
  }
  return p;
}
