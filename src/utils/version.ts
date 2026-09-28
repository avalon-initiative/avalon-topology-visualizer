/** Compares dotted versions numerically ("0.10.0" > "0.9.3"); a prerelease sorts below its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.trim().replace(/^v/i, '').split('-', 2)
    return { nums: core.split('.').map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0)), pre }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  if (x.pre === y.pre) return 0
  if (x.pre === undefined) return 1
  if (y.pre === undefined) return -1
  return x.pre < y.pre ? -1 : 1
}

export function newestVersion(versions: string[]): string | undefined {
  return versions.reduce<string | undefined>((best, v) => (best === undefined || compareVersions(v, best) > 0 ? v : best), undefined)
}
