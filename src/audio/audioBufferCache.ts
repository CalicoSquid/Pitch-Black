/** Bounded decoded PCM retention; playing sources own their buffers independently. */
export class AudioBufferCache {
  private entries = new Map<string, { buffer: AudioBuffer; bytes: number }>()
  private bytes = 0

  private readonly budget: number

  constructor(budget = 32 * 1024 * 1024) {
    this.budget = budget
  }

  get(key: string) {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.buffer
  }

  set(key: string, buffer: AudioBuffer) {
    const previous = this.entries.get(key)
    if (previous) {
      this.bytes -= previous.bytes
      this.entries.delete(key)
    }
    const bytes = buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT
    // Large recordings can still play, but must not become permanent cache residents.
    if (bytes > this.budget) return
    while (this.bytes + bytes > this.budget) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.bytes -= this.entries.get(oldest)!.bytes
      this.entries.delete(oldest)
    }
    this.entries.set(key, { buffer, bytes })
    this.bytes += bytes
  }
}
