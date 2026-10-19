// Writes a proper, steady-30-fps H.264 + AAC .mp4 (the kind WhatsApp, Instagram and TikTok accept) using the browser's own video encoder.
// (The browser's MediaRecorder writes a fragmented, variable-frame-rate mp4 that WhatsApp often stalls on.)
import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.mjs';

const FPS = 30;
export const WHATSAPP_BYTES = 14e6;                                   // WhatsApp sends video up to about 16 MB as a video: aim a little under
/** Video bits per second that keep a replay of `seconds` under ~14 MB with 128 kbps sound (never above 3.5 Mbps, never below 1 Mbps). */
export function videoBitrate(seconds, cap = 3.5e6) {
  const total = (WHATSAPP_BYTES * 8) / Math.max(5, seconds) - 128000;
  return Math.round(Math.min(cap, Math.max(1e6, total)));
}
const even = (n) => Math.max(2, Math.floor(n / 2) * 2);

/** Returns a saver, or null when this browser cannot encode (the caller then uses MediaRecorder). `prefs` lets a test pick other codecs. */
export async function createMp4Saver({ width, height, seconds, sound, prefs = {} }) {
  const G = globalThis;
  if (!G.VideoEncoder || !G.AudioEncoder || !G.VideoFrame || !G.AudioData || !sound || !sound.capture) return null;
  width = even(width); height = even(height);
  const vcodec = prefs.video || 'avc1.640029', acodec = prefs.audio || 'mp4a.40.2', mv = prefs.mux?.video || 'avc', ma = prefs.mux?.audio || 'aac';
  const bitrate = videoBitrate(seconds);
  const vcfg = { codec: vcodec, width, height, bitrate, framerate: FPS, latencyMode: 'realtime' };
  const rate = sound.ctx ? sound.ctx.sampleRate : 48000;
  const acfg = { codec: acodec, sampleRate: rate, numberOfChannels: 2, bitrate: 128000 };
  try {
    const [v, a] = await Promise.all([G.VideoEncoder.isConfigSupported(vcfg), G.AudioEncoder.isConfigSupported(acfg)]);
    if (!v.supported || !a.supported) return null;
  } catch { return null; }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: mv, width, height, frameRate: FPS }, audio: { codec: ma, numberOfChannels: 2, sampleRate: rate }, fastStart: 'in-memory' });
  let failed = false;
  const venc = new G.VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: () => { failed = true; } });
  const aenc = new G.AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: () => { failed = true; } });
  venc.configure(vcfg); aenc.configure(acfg);

  let t0 = 0, last = null, idx = -1, stopCapture = null, samples = 0, aOffset = null, closed = false;
  return {
    bitrate, width, height,
    start() {
      t0 = performance.now();
      stopCapture = sound.capture((l, r) => {                          // sound, as it comes out of the mix
        if (closed || failed) return;
        if (aOffset == null) aOffset = 0;                              // (the muxer wants every track to start at 0)
        const data = new Float32Array(l.length * 2); data.set(l, 0); data.set(r, l.length);
        const ts = Math.round((aOffset + samples / rate) * 1e6); samples += l.length;
        const ad = new G.AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: l.length, numberOfChannels: 2, timestamp: ts, data });
        aenc.encode(ad); ad.close();
      });
    },
    /** Call once per rendered picture: it is written at a steady 30 fps (a slow frame is repeated, a spare one dropped). */
    addFrame(canvas, force = false) {
      if (closed || failed) return;
      last = canvas;
      const n = Math.floor(((performance.now() - t0) / 1000) * FPS);
      for (let i = idx < 0 ? 0 : idx + 1; i <= (idx < 0 ? 0 : n); i++) {           // (the first picture is frame 0; a slow frame is held until the next one, so the speed stays steady)
        if (venc.encodeQueueSize > (force ? 1e9 : 120)) return;
        const f = new G.VideoFrame(canvas, { timestamp: Math.round((i / FPS) * 1e6), duration: Math.round(1e6 / FPS) });
        venc.encode(f, { keyFrame: i % (FPS * 2) === 0 }); f.close(); idx = i;
      }
    },
    cancel() { closed = true; try { stopCapture && stopCapture(); } catch { /* gone */ } try { venc.close(); aenc.close(); } catch { /* closed */ } },
    async finish() {
      if (last) this.addFrame(last, true);                              // the last picture is held to the end
      closed = true; try { stopCapture && stopCapture(); } catch { /* gone */ }
      if (failed) { try { venc.close(); aenc.close(); } catch { /* closed */ } return null; }
      await venc.flush(); await aenc.flush(); muxer.finalize(); venc.close(); aenc.close();
      return new Blob([target.buffer], { type: 'video/mp4' });
    },
  };
}
