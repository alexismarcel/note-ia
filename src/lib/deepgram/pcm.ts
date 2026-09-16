// Converts a Float32 [-1, 1] audio frame (as produced by the VAD's 16kHz
// resampler) into little-endian 16-bit PCM, the format Deepgram's
// streaming API expects for encoding=linear16.
export function floatTo16BitPCM(float32: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
