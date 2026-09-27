import { FeasibilityEventSchema } from '@svara/contracts';
import type { FeasibilityEvent } from '@svara/contracts';

/** Decodes one base64 audio packet into the bytes the playback worklet expects. */
export function decodeAudioPacket(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (!bytes.length || bytes.length > 4800 || bytes.length % 2)
    throw new Error('Malformed audio packet.');
  return bytes.buffer;
}

/** Base64 for a recorded question; chunked so large recordings stay off the call stack. */
export function encodeAudio(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export async function* readVoiceStream(
  response: Response,
  generation: number,
): AsyncGenerator<FeasibilityEvent> {
  if (!response.ok || !response.body)
    throw new Error('The local voice stream is unavailable. Retry the scenario.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let sequence = 0;
  let turnId: string | undefined;
  let complete = false;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      while (buffer.includes('\n')) {
        const split = buffer.indexOf('\n');
        if (split > 16000) throw new Error('Voice event exceeds its size limit.');
        const event = FeasibilityEventSchema.parse(JSON.parse(buffer.slice(0, split)));
        buffer = buffer.slice(split + 1);
        if (
          complete ||
          event.generation !== generation ||
          event.seq !== sequence++ ||
          (turnId && turnId !== event.turnId)
        )
          throw new Error('Voice stream sequence changed. Retry the scenario.');
        turnId = event.turnId;
        complete = event.type === 'complete' || event.type === 'error';
        yield event;
      }
      if (buffer.length > 16000) throw new Error('Voice event exceeds its size limit.');
      if (chunk.done) break;
    }
    if (!complete || buffer.trim())
      throw new Error('Voice stream interrupted before completion. Retry the scenario.');
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
