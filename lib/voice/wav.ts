const TARGET_SAMPLE_RATE = 16_000;

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function resampleMonoPcm(
  source: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = TARGET_SAMPLE_RATE
) {
  if (
    source.length === 0 ||
    !Number.isFinite(sourceSampleRate) ||
    sourceSampleRate <= 0 ||
    !Number.isFinite(targetSampleRate) ||
    targetSampleRate <= 0
  ) {
    return new Float32Array();
  }
  if (sourceSampleRate === targetSampleRate) return source.slice();

  const targetLength = Math.max(
    1,
    Math.round((source.length * targetSampleRate) / sourceSampleRate)
  );
  const result = new Float32Array(targetLength);
  const ratio = sourceSampleRate / targetSampleRate;
  for (let index = 0; index < targetLength; index += 1) {
    const sourcePosition = index * ratio;
    const leftIndex = Math.min(
      source.length - 1,
      Math.floor(sourcePosition)
    );
    const rightIndex = Math.min(source.length - 1, leftIndex + 1);
    const fraction = sourcePosition - leftIndex;
    result[index] =
      source[leftIndex] * (1 - fraction) + source[rightIndex] * fraction;
  }
  return result;
}

export function encodePcm16Wav(samples: Float32Array, sampleRate: number) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(
      44 + index * 2,
      sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767),
      true
    );
  }
  return bytes;
}

function mixAudioBufferToMono(audioBuffer: AudioBuffer) {
  const mono = new Float32Array(audioBuffer.length);
  for (
    let channelIndex = 0;
    channelIndex < audioBuffer.numberOfChannels;
    channelIndex += 1
  ) {
    const channel = audioBuffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
      mono[sampleIndex] += channel[sampleIndex] / audioBuffer.numberOfChannels;
    }
  }
  return mono;
}

export async function normalizeRecordedAudioForAsr(blob: Blob) {
  const mimeType = blob.type.trim().toLowerCase().split(";")[0];
  if (
    mimeType === "audio/wav" ||
    mimeType === "audio/wave" ||
    mimeType === "audio/x-wav" ||
    mimeType === "audio/mpeg" ||
    mimeType === "audio/mp3" ||
    mimeType === "audio/mp4" ||
    mimeType === "audio/m4a" ||
    mimeType === "audio/aac"
  ) {
    return blob;
  }

  const AudioContextConstructor =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("当前浏览器无法转换录音格式，请改用文字输入。");
  }

  const context = new AudioContextConstructor();
  try {
    const audioBuffer = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = mixAudioBufferToMono(audioBuffer);
    const resampled = resampleMonoPcm(
      mono,
      audioBuffer.sampleRate,
      TARGET_SAMPLE_RATE
    );
    const wavBytes = encodePcm16Wav(resampled, TARGET_SAMPLE_RATE);
    const body = wavBytes.buffer.slice(
      wavBytes.byteOffset,
      wavBytes.byteOffset + wavBytes.byteLength
    );
    return new Blob([body], { type: "audio/wav" });
  } finally {
    await context.close();
  }
}
