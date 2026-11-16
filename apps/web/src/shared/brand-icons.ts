const svgModules = import.meta.glob<string>('../features/*/assets/brands/*.svg', {
  eager: true,
  import: 'default',
});

const iconsByKey = new Map<string, string>();
for (const [filePath, url] of Object.entries(svgModules)) {
  const match = /\/([^/]+)\.svg$/.exec(filePath);
  if (match?.[1]) {
    iconsByKey.set(match[1], url);
  }
}

export function brandIconUrl(key?: string): string | undefined {
  if (!key) return undefined;
  return iconsByKey.get(key);
}
