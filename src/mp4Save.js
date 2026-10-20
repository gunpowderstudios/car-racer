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
export async function createMp4Saver({ width, height, seconds, sound, prefs = {}, audio = true, music = null, maxBitrate = 3.5e6 }) {
  const G = globalThis;
  if (!G.VideoEncoder || !G.VideoFrame) return null;
  const withAudio = audio || !!music, capture = audio && !music;                  // (music: a finished sound track is laid on afterwards, so nothing is recorded as it plays - that is what makes a quick film quick)
  if (withAudio && (!G.AudioEncoder || !G.AudioData)) return null;
  if (capture && (!sound || !sound.capture)) return null;
  width = even(width); height = even(height);
  const vcodec = prefs.video || 'avc1.640033', acodec = prefs.audio || 'mp4a.40.2', mv = prefs.mux?.video || 'avc', ma = prefs.mux?.audio || 'aac';
  const bitrate = videoBitrate(seconds, maxBitrate);
  const vcfg = { codec: vcodec, width, height, bitrate, framerate: FPS, latencyMode: 'realtime' };
  const rate = sound && sound.ctx ? sound.ctx.sampleRate : 48000;
  const acfg = { codec: acodec, sampleRate: rate, numberOfChannels: 2, bitrate: 128000 };
  try {
    const [v, a] = await Promise.all([G.VideoEncoder.isConfigSupported(vcfg), withAudio ? G.AudioEncoder.isConfigSupported(acfg) : { supported: true }]);
    if (!v.supported || !a.supported) return null;
  } catch { return null; }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: mv, width, height, frameRate: FPS }, ...(withAudio ? { audio: { codec: ma, numberOfChannels: 2, sampleRate: rate } } : {}), fastStart: 'in-memory' });
  let failed = false;
  const venc = new G.VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: () => { failed = true; } });
  const aenc = withAudio ? new G.AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: () => { failed = true; } }) : null;
  venc.configure(vcfg); if (aenc) aenc.configure(acfg);

  // The video clock is the REPLAY's own clock (not the wall clock): a frame is stamped with how far through the replay it is, so the picture can
  // never run fast or jump, even on a slow machine. If the encoder falls behind, the replay is simply held (see busy()) and the sound pauses with it.
  let last = null, idx = -1, stopCapture = null, samples = 0, closed = false, hold = false, clock = 0;
  return {
    bitrate, width, height,
    busy() { return venc.encodeQueueSize > 4 || (aenc && aenc.encodeQueueSize > 30); },
    setClock(seconds, h) { clock = seconds; hold = !!h; },                 // how far through the replay it is: sound is only kept up to this point, so it can never run longer than the picture
    start() {
      if (!capture) return;
      stopCapture = sound.capture((l, r) => {                          // sound, as it comes out of the mix (skipped while the replay is held)
        if (closed || failed || hold || samples / rate > clock + 0.15) return;
        const data = new Float32Array(l.length * 2); data.set(l, 0); data.set(r, l.length);
        const ts = Math.round((samples / rate) * 1e6); samples += l.length;
        const ad = new G.AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: l.length, numberOfChannels: 2, timestamp: ts, data });
        aenc.encode(ad); ad.close();
      });
    },
    /** Call once per rendered picture with how many seconds into the replay it is: written at a steady 30 fps (a slow frame is held, a spare one dropped). */
    addFrame(canvas, seconds, force = false) {
      if (closed || failed) return;
      last = canvas;
      const n = idx < 0 ? 0 : Math.floor(Math.max(0, seconds) * FPS + 0.5);
      for (let i = idx + 1; i <= n; i++) {
        if (!force && i > idx + 1 && venc.encodeQueueSize > 12) return;
        const f = new G.VideoFrame(canvas, { timestamp: Math.round((i / FPS) * 1e6), duration: Math.round(1e6 / FPS) });
        venc.encode(f, { keyFrame: i % (FPS * 2) === 0 }); f.close(); idx = i;
      }
    },
    cancel() { closed = true; try { stopCapture && stopCapture(); } catch { /* gone */ } try { venc.close(); aenc && aenc.close(); } catch { /* closed */ } },
    async finish() {
      closed = true; try { stopCapture && stopCapture(); } catch { /* gone */ }
      if (failed) { try { venc.close(); aenc && aenc.close(); } catch { /* closed */ } return null; }
      if (music && aenc) {                                                      // lay the sound track: the music for the whole film, quieter at the end
        const buf = music.buffer, nch = Math.min(2, buf.numberOfChannels), total = Math.round(seconds * rate), block = 4096;
        const src = [buf.getChannelData(0), buf.getChannelData(nch - 1)], len = src[0].length, vol = Math.max(0, Math.min(1, music.vol ?? 0.7)), fade = Math.min(total, Math.round(rate * 1.5));
        for (let at = 0; at < total && len > 0; at += block) {
          const n = Math.min(block, total - at), data = new Float32Array(n * 2);
          for (let i = 0; i < n; i++) {
            const g = vol * (total - (at + i) < fade ? (total - (at + i)) / fade : 1), k = (at + i) % len;      // (a short tune starts again)
            data[i] = src[0][k] * g; data[n + i] = src[1][k] * g;
          }
          const ad = new G.AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((at / rate) * 1e6), data });
          aenc.encode(ad); ad.close();
          if (aenc.encodeQueueSize > 40) await new Promise((ok) => setTimeout(ok, 0));
        }
      }
      await venc.flush(); if (aenc) await aenc.flush(); muxer.finalize(); venc.close(); if (aenc) aenc.close();
      return new Blob([target.buffer], { type: 'video/mp4' });
    },
  };
}
