import type { TargetInfo } from './types';

export interface Target extends TargetInfo {
  embedding: Float32Array;
}

export class Targets {
  private targets = new Map<string, Target>();

  add(target: Target) {
    this.targets.set(target.id, target);
    return target;
  }

  remove(id: string) {
    this.targets.delete(id);
  }

  get(id: string) {
    return this.targets.get(id);
  }

  get size() {
    return this.targets.size;
  }

  count(source: Target['source']) {
    return [...this.targets.values()].filter((t) => t.source === source).length;
  }

  match(embeddings: Float32Array[]) {
    const targets = [...this.targets.values()];
    return embeddings.map((e) => {
      let best: Target | null = null;
      let bestScore = -1;
      for (const t of targets) {
        let score = 0;
        for (let k = 0; k < e.length; k++) score += e[k] * t.embedding[k];
        if (score > bestScore) [best, bestScore] = [t, score];
      }
      return { target: best?.id ?? null, score: bestScore };
    });
  }
}
