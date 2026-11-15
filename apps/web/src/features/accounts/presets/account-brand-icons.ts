const sharedSvgModules = import.meta.glob<string>('../../subscriptions/assets/brands/*.svg', {
  eager: true,
  import: 'default',
});

const accountSvgModules = import.meta.glob<string>('../assets/brands/*.svg', {
  eager: true,
  import: 'default',
});

const iconsByKey = new Map<string, string>();
for (const source of [sharedSvgModules, accountSvgModules]) {
  for (const [filePath, url] of Object.entries(source)) {
    const match = /\/([^/]+)\.svg$/.exec(filePath);
    if (match?.[1]) {
      iconsByKey.set(match[1], url);
    }
  }
}

export function accountBrandIconUrl(key: string): string | undefined {
  return iconsByKey.get(key);
}
