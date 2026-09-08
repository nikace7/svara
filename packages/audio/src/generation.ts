/** Invalidate synchronously before abort listeners or late provider callbacks run. */
export class GenerationOwner {
  private generation = 0;
  private controller: AbortController | undefined;

  begin(): { id: number; signal: AbortSignal } {
    this.cancel();
    this.controller = new AbortController();
    return { id: this.generation, signal: this.controller.signal };
  }

  cancel(): number {
    this.generation++;
    const old = this.controller;
    this.controller = undefined;
    old?.abort();
    return this.generation;
  }

  accepts(id: number): boolean {
    return (
      this.generation === id && this.controller !== undefined && !this.controller.signal.aborted
    );
  }
}
