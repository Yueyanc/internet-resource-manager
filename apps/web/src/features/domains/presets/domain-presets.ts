import type { Domain, DomainIcpStatus } from '@irm/api-client';

export type DomainPresetGroup = 'popular' | 'global' | 'domestic' | 'edge_dns';

export const domainPresetGroups: { key: DomainPresetGroup; zh: string; en: string }[] = [
  { key: 'popular', zh: '热门常用', en: 'Popular' },
  { key: 'global', zh: '海外注册商', en: 'Global Registrars' },
  { key: 'domestic', zh: '国内合规', en: 'CN Registrars' },
  { key: 'edge_dns', zh: '边缘与云解析', en: 'Edge & Cloud DNS' },
];

export type DomainPreset = {
  key: string;
  iconKey: string;
  registrar: { zh: string; en: string };
  dnsProvider: { zh: string; en: string };
  subtitle: { zh: string; en: string };
  color: string;
  darkInvert?: boolean;
  defaultManagementUrl: string;
  defaultWhoisPrivacy: boolean;
  defaultIcpStatus?: DomainIcpStatus;
  accountPresetKey: string;
  groups: DomainPresetGroup[];
  keywords: string[];
};

export const domainPresets: DomainPreset[] = [
  {
    key: 'cloudflare',
    iconKey: 'cloudflare',
    registrar: { zh: 'Cloudflare', en: 'Cloudflare' },
    dnsProvider: { zh: 'Cloudflare DNS', en: 'Cloudflare DNS' },
    subtitle: { zh: '零溢价续费 · Anycast 权威解析', en: 'At-cost renewal · Anycast DNS' },
    color: '#f38020',
    defaultManagementUrl: 'https://dash.cloudflare.com',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'cloudflare_account',
    groups: ['popular', 'global', 'edge_dns'],
    keywords: ['cloudflare', 'cf', 'dash.cloudflare.com', '橙云'],
  },
  {
    key: 'porkbun',
    iconKey: 'porkbun',
    registrar: { zh: 'Porkbun', en: 'Porkbun' },
    dnsProvider: { zh: 'Porkbun DNS', en: 'Porkbun DNS' },
    subtitle: { zh: '低价透明续费 · 免费 WHOIS 隐私', en: 'Low renewal · Free WHOIS privacy' },
    color: '#ef7878',
    defaultManagementUrl: 'https://porkbun.com/account/domainsSpeedy',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'porkbun_account',
    groups: ['popular', 'global'],
    keywords: ['porkbun', '猪肉包'],
  },
  {
    key: 'spaceship',
    iconKey: 'spaceship',
    registrar: { zh: 'Spaceship', en: 'Spaceship' },
    dnsProvider: { zh: 'Spaceship DNS', en: 'Spaceship DNS' },
    subtitle: { zh: 'Namecheap 旗下新锐低价注册商', en: 'Modern registrar by Namecheap' },
    color: '#2952ff',
    defaultManagementUrl: 'https://www.spaceship.com/application/domain-list-application/',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'spaceship_account',
    groups: ['popular', 'global'],
    keywords: ['spaceship', '飞船'],
  },
  {
    key: 'namecheap',
    iconKey: 'namecheap',
    registrar: { zh: 'Namecheap', en: 'Namecheap' },
    dnsProvider: { zh: 'Namecheap BasicDNS', en: 'Namecheap BasicDNS' },
    subtitle: { zh: '老牌海外注册商 · Domain Privacy', en: 'Global registrar · Domain Privacy' },
    color: '#de3723',
    defaultManagementUrl: 'https://ap.www.namecheap.com/domains/list/',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'namecheap_account',
    groups: ['popular', 'global'],
    keywords: ['namecheap', 'nc'],
  },
  {
    key: 'aliyun_wanwang',
    iconKey: 'aliyun',
    registrar: { zh: '阿里云万网', en: 'Alibaba Cloud Domains' },
    dnsProvider: { zh: '阿里云云解析 DNS', en: 'Alibaba Cloud DNS' },
    subtitle: { zh: '国内主力注册商 · 支持 ICP 备案', en: 'CN registrar · ICP filing ready' },
    color: '#ff6a00',
    defaultManagementUrl: 'https://dc.console.aliyun.com',
    defaultWhoisPrivacy: true,
    defaultIcpStatus: 'verified',
    accountPresetKey: 'aliyun_account',
    groups: ['popular', 'domestic'],
    keywords: ['aliyun', 'alibaba', 'wanwang', '阿里云', '万网', 'hichina'],
  },
  {
    key: 'tencent_dnspod',
    iconKey: 'tencent_cloud',
    registrar: { zh: '腾讯云 DNSPod', en: 'Tencent Cloud DNSPod' },
    dnsProvider: { zh: 'DNSPod 解析', en: 'DNSPod DNS' },
    subtitle: { zh: '国内双线智能解析 · 备案接入', en: 'Smart GeoDNS · ICP filing' },
    color: '#0052d9',
    defaultManagementUrl: 'https://console.cloud.tencent.com/domain',
    defaultWhoisPrivacy: true,
    defaultIcpStatus: 'verified',
    accountPresetKey: 'tencent_account',
    groups: ['popular', 'domestic', 'edge_dns'],
    keywords: ['tencent', 'dnspod', '腾讯云', 'qcloud'],
  },
  {
    key: 'namesilo',
    iconKey: 'namesilo',
    registrar: { zh: 'NameSilo', en: 'NameSilo' },
    dnsProvider: { zh: 'NameSilo DNS', en: 'NameSilo DNS' },
    subtitle: { zh: '长持免溢价 · 终身 WHOIS 隐私', en: 'Bulk holdings · Free WHOIS privacy' },
    color: '#1d4ed8',
    defaultManagementUrl: 'https://www.namesilo.com/account_domains.php',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'cloudflare_account',
    groups: ['global'],
    keywords: ['namesilo', 'silo'],
  },
  {
    key: 'dynadot',
    iconKey: 'dynadot',
    registrar: { zh: 'Dynadot', en: 'Dynadot' },
    dnsProvider: { zh: 'Dynadot DNS', en: 'Dynadot DNS' },
    subtitle: { zh: 'ICANN 认证注册商 · 支持支付宝', en: 'ICANN registrar · Clean console' },
    color: '#0284c7',
    defaultManagementUrl: 'https://www.dynadot.com/account/domain/name/server.html',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'cloudflare_account',
    groups: ['popular', 'global'],
    keywords: ['dynadot'],
  },
  {
    key: 'aws_route53',
    iconKey: 'aws',
    registrar: { zh: 'AWS Route 53', en: 'AWS Route 53' },
    dnsProvider: { zh: 'Amazon Route 53', en: 'Amazon Route 53' },
    subtitle: { zh: '企业级 SLA 权威托管与域名注册', en: '100% SLA authoritative DNS' },
    color: '#ff9900',
    defaultManagementUrl: 'https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'aws_account',
    groups: ['edge_dns', 'global'],
    keywords: ['aws', 'route53', 'route 53', 'amazon'],
  },
  {
    key: 'vercel_domains',
    iconKey: 'vercel',
    registrar: { zh: 'Vercel Domains', en: 'Vercel Domains' },
    dnsProvider: { zh: 'Vercel Edge DNS', en: 'Vercel Edge DNS' },
    subtitle: { zh: '前端边缘自动签发证书与解析', en: 'Zero-config SSL & Edge DNS' },
    color: '#171717',
    darkInvert: true,
    defaultManagementUrl: 'https://vercel.com/dashboard/domains',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'github_account',
    groups: ['edge_dns'],
    keywords: ['vercel', 'zeit'],
  },
  {
    key: 'google_cloud_dns',
    iconKey: 'gcp',
    registrar: { zh: 'Squarespace / Google', en: 'Squarespace / Google' },
    dnsProvider: { zh: 'Google Cloud DNS', en: 'Google Cloud DNS' },
    subtitle: { zh: '原 Google Domains 迁移与云解析', en: 'Cloud DNS & Workspace domains' },
    color: '#4285f4',
    defaultManagementUrl: 'https://console.cloud.google.com/net-services/dns/zones',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'google_account',
    groups: ['edge_dns', 'global'],
    keywords: ['google', 'gcp', 'squarespace', 'cloud dns'],
  },
  {
    key: 'ovh_domains',
    iconKey: 'ovh',
    registrar: { zh: 'OVHcloud', en: 'OVHcloud' },
    dnsProvider: { zh: 'OVH Anycast DNS', en: 'OVH Anycast DNS' },
    subtitle: { zh: '欧洲国别后缀与高防域名注册', en: 'EU ccTLDs & DNSSEC' },
    color: '#000e9c',
    defaultManagementUrl: 'https://www.ovh.com/manager/',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'cloudflare_account',
    groups: ['global'],
    keywords: ['ovh', 'ovhcloud'],
  },
  {
    key: 'digitalocean_dns',
    iconKey: 'digitalocean',
    registrar: { zh: 'Namecheap / External', en: 'External Registrar' },
    dnsProvider: { zh: 'DigitalOcean DNS', en: 'DigitalOcean DNS' },
    subtitle: { zh: 'Droplet 与 App Platform 免费托管解析', en: 'Free Cloud DNS hosting' },
    color: '#0080ff',
    defaultManagementUrl: 'https://cloud.digitalocean.com/networking/domains',
    defaultWhoisPrivacy: true,
    accountPresetKey: 'cloudflare_account',
    groups: ['edge_dns'],
    keywords: ['digitalocean', 'do dns'],
  },
];

const presetsByKey = new Map(domainPresets.map(item => [item.key, item]));

export const domainTagPresets = [
  '生产主域',
  'Cloudflare 橙云',
  'SSL 自动续签',
  '企业邮 MX',
  '国内备案',
  'CDN 边缘',
  '内网泛解析',
  '防御持有',
] as const;

export function findDomainPreset(key: string): DomainPreset | undefined {
  return presetsByKey.get(key);
}

export function resolveDomainPreset(
  value: Pick<Domain, 'presetKey' | 'registrar' | 'dnsProvider' | 'name'>,
): DomainPreset | undefined {
  if (value.presetKey) {
    const direct = presetsByKey.get(value.presetKey);
    if (direct) return direct;
  }
  const hay = `${value.registrar} ${value.dnsProvider}`.trim().toLowerCase();
  if (!hay) return undefined;
  return domainPresets.find(preset =>
    preset.keywords.some(kw => hay.includes(kw.toLowerCase())),
  );
}

export function filterDomainPresets(query: string, group: DomainPresetGroup): DomainPreset[] {
  const clean = query.trim().toLowerCase();
  if (!clean) {
    return domainPresets.filter(item => item.groups.includes(group));
  }
  return domainPresets.filter((item) => {
    const hay = [
      item.key,
      item.registrar.zh,
      item.registrar.en,
      item.dnsProvider.zh,
      item.dnsProvider.en,
      item.subtitle.zh,
      item.subtitle.en,
      ...item.keywords,
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(clean);
  });
}
