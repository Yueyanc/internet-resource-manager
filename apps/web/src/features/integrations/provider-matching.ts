export type CloudSyncProviderKey
  = | 'cloudflare'
    | 'tailscale'
    | 'aliyun'
    | 'tencent'
    | 'hetzner'
    | 'digitalocean'
    | 'bandwagon'
    | 'porkbun'
    | 'spaceship'
    | 'vercel';

export interface ProviderBriefMeta {
  key: CloudSyncProviderKey;
  zh: string;
  en: string;
  color: string;
}

export const PROVIDER_BRIEFS: Record<CloudSyncProviderKey, ProviderBriefMeta> = {
  cloudflare: { key: 'cloudflare', zh: 'Cloudflare', en: 'Cloudflare', color: '#f6821f' },
  tailscale: { key: 'tailscale', zh: 'Tailscale', en: 'Tailscale', color: '#2563eb' },
  aliyun: { key: 'aliyun', zh: '阿里云', en: 'Alibaba Cloud', color: '#ff6a00' },
  tencent: { key: 'tencent', zh: '腾讯云', en: 'Tencent Cloud', color: '#0052d9' },
  hetzner: { key: 'hetzner', zh: 'Hetzner', en: 'Hetzner', color: '#d50c2d' },
  digitalocean: { key: 'digitalocean', zh: 'DigitalOcean', en: 'DigitalOcean', color: '#0080ff' },
  bandwagon: { key: 'bandwagon', zh: '搬瓦工', en: 'BandwagonHost', color: '#0284c7' },
  porkbun: { key: 'porkbun', zh: 'Porkbun', en: 'Porkbun', color: '#ec4899' },
  spaceship: { key: 'spaceship', zh: 'Spaceship', en: 'Spaceship', color: '#4f46e5' },
  vercel: { key: 'vercel', zh: 'Vercel', en: 'Vercel', color: '#171717' },
};

export function resolveDomainSyncProvider(input: {
  presetKey?: string;
  registrar?: string;
  dnsProvider?: string;
}): CloudSyncProviderKey | null {
  const pk = (input.presetKey ?? '').trim().toLowerCase();
  switch (pk) {
    case 'cloudflare':
      return 'cloudflare';
    case 'porkbun':
      return 'porkbun';
    case 'spaceship':
      return 'spaceship';
    case 'aliyun':
    case 'aliyun_wanwang':
      return 'aliyun';
    case 'tencent':
    case 'tencent_dnspod':
    case 'dnspod':
      return 'tencent';
    case 'vercel':
    case 'vercel_domains':
      return 'vercel';
    case 'digitalocean':
    case 'digitalocean_dns':
      return 'digitalocean';
  }

  const hay = `${input.registrar ?? ''} ${input.dnsProvider ?? ''}`.toLowerCase();
  if (hay.includes('cloudflare')) return 'cloudflare';
  if (hay.includes('porkbun')) return 'porkbun';
  if (hay.includes('spaceship')) return 'spaceship';
  if (hay.includes('阿里云') || hay.includes('万网') || hay.includes('aliyun') || hay.includes('alibaba') || hay.includes('alidns')) return 'aliyun';
  if (hay.includes('腾讯云') || hay.includes('dnspod') || hay.includes('tencent')) return 'tencent';
  if (hay.includes('vercel')) return 'vercel';
  if (hay.includes('digitalocean')) return 'digitalocean';
  return null;
}

export function resolveServerSyncProvider(input: {
  presetKey?: string;
  provider?: string;
}): CloudSyncProviderKey | null {
  const pk = (input.presetKey ?? '').trim().toLowerCase();
  switch (pk) {
    case 'bandwagon':
      return 'bandwagon';
    case 'hetzner':
      return 'hetzner';
    case 'digitalocean':
      return 'digitalocean';
    case 'aliyun':
      return 'aliyun';
    case 'tencent':
    case 'tencent_cloud':
      return 'tencent';
    case 'tailscale':
    case 'mac_mini':
    case 'synology':
    case 'unraid':
    case 'proxmox':
      return 'tailscale';
  }

  const hay = (input.provider ?? '').toLowerCase();
  if (hay.includes('搬瓦工') || hay.includes('bandwagon') || hay.includes('bwh')) return 'bandwagon';
  if (hay.includes('hetzner')) return 'hetzner';
  if (hay.includes('digitalocean')) return 'digitalocean';
  if (hay.includes('阿里云') || hay.includes('aliyun') || hay.includes('alibaba')) return 'aliyun';
  if (hay.includes('腾讯云') || hay.includes('tencent') || hay.includes('lighthouse')) return 'tencent';
  if (hay.includes('tailscale')) return 'tailscale';
  return null;
}

export function resolveIpSyncProvider(input: {
  presetKey?: string;
  provider?: string;
}): CloudSyncProviderKey | null {
  const pk = (input.presetKey ?? '').trim().toLowerCase();
  switch (pk) {
    case 'tailscale':
      return 'tailscale';
    case 'hetzner':
      return 'hetzner';
    case 'digitalocean':
      return 'digitalocean';
    case 'bandwagon':
      return 'bandwagon';
    case 'aliyun':
    case 'aliyun_eip':
      return 'aliyun';
    case 'tencent':
    case 'tencent_cloud':
      return 'tencent';
  }

  const hay = (input.provider ?? '').toLowerCase();
  if (hay.includes('tailscale')) return 'tailscale';
  if (hay.includes('hetzner')) return 'hetzner';
  if (hay.includes('digitalocean')) return 'digitalocean';
  if (hay.includes('搬瓦工') || hay.includes('bandwagon') || hay.includes('bwh')) return 'bandwagon';
  if (hay.includes('阿里云') || hay.includes('aliyun') || hay.includes('alibaba')) return 'aliyun';
  if (hay.includes('腾讯云') || hay.includes('tencent')) return 'tencent';
  return null;
}
