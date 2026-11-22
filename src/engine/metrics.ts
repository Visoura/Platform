const WINDOW = 100;

export class Metrics {
  private samples: Record<string, number[]> = {};
  private counters: Record<string, number> = {};
  private previous: Record<string, number> = {};
  rates: Record<string, number> = {};

  add(stage: string, ms: number) {
    const values = (this.samples[stage] ??= []);
    values.push(ms);
    if (values.length > WINDOW) values.shift();
  }

  count(name: string, n = 1) {
    this.counters[name] = (this.counters[name] ?? 0) + n;
  }

  tick() {
    this.rates = Object.fromEntries(Object.entries(this.counters).map(([k, v]) => [k, v - (this.previous[k] ?? 0)]));
    this.previous = { ...this.counters };
  }

  stage(name: string) {
    const values = [...(this.samples[name] ?? [])].sort((a, b) => a - b);
    if (!values.length) return null;
    const at = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
    return { mean: values.reduce((a, b) => a + b, 0) / values.length, p50: at(0.5), p95: at(0.95), n: values.length };
  }

  reset() {
    this.samples = {};
    this.counters = {};
    this.previous = {};
    this.rates = {};
  }
}
