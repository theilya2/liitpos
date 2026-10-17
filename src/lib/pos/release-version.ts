/** Turn a release tag into the integer Android compares. `v1.0.1001` and `1.0.1001+1001` both yield 1001. */
export function versionFromTag(tag: string): { versionCode: number; versionName: string } | null {
  const versionName = tag.trim().replace(/^v/, "");
  if (!versionName) return null;
  const plus = versionName.lastIndexOf("+");
  const raw = plus >= 0 ? versionName.slice(plus + 1) : (versionName.split(".").pop() ?? "");
  if (!/^[0-9]+$/.test(raw)) return null;
  const versionCode = Number(raw);
  if (!Number.isInteger(versionCode) || versionCode <= 0) return null;
  return { versionCode, versionName };
}
