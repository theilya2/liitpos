const EXT = /\.(?:ts|tsx|mjs|js|json|css)$/;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const file = EXT.test(rel) ? rel : `${rel}.ts`;
    const url = new URL(`../src/${file}`, import.meta.url);
    return nextResolve(url.href, context);
  }
  return nextResolve(specifier, context);
}
