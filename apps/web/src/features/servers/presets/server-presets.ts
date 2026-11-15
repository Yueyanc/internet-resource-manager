import type { ServerHost, ServerInput } from '@irm/api-client';

export type ServerPresetGroup
  = | 'popular'
    | 'overseas_vps'
    | 'global_cloud'
    | 'domestic_cloud'
    | 'homelab_nas';

export type ServerPresetPlan = {
  id: string;
  label: { zh: string; en: string };
  nameHint: string;
  region: string;
  datacenter?: string;
  arch?: ServerInput['arch'];
  cpuCores: number;
  memoryMb: number;
  diskGb: number;
  diskType?: ServerInput['diskType'];
  bandwidthMbps: number;
  trafficGb: number;
  trafficRule?: ServerInput['trafficRule'];
  portNote?: string;
  suggestedPrice?: { amount: number; currency: 'CNY' | 'USD' | 'HKD' | 'EUR' | 'GBP' | 'JPY'; cycle: 'monthly' | 'quarterly' | 'yearly' };
};

export type ServerPreset = {
  key: string;
  iconKey: string;
  provider: { zh: string; en: string };
  subtitle: { zh: string; en: string };
  group: Exclude<ServerPresetGroup, 'popular'>;
  popular?: boolean;
  kind: ServerInput['kind'];
  region: string;
  defaultOs: string;
  defaultArch?: ServerInput['arch'];
  defaultSshUser?: string;
  defaultSshPort?: number;
  color: string;
  darkInvert?: boolean;
  keywords: string[];
  consoleUrl?: string;
  tip?: { zh: string; en: string };
  plans?: ServerPresetPlan[];
};

export const serverPresetGroups: { key: ServerPresetGroup; zh: string; en: string }[] = [
  { key: 'popular', zh: '热门常用', en: 'Popular' },
  { key: 'overseas_vps', zh: '海外精品 VPS', en: 'Overseas VPS' },
  { key: 'global_cloud', zh: '国际大厂云', en: 'Global Cloud' },
  { key: 'domestic_cloud', zh: '国内云与轻量', en: 'CN Cloud' },
  { key: 'homelab_nas', zh: '家宽与 NAS', en: 'HomeLab & NAS' },
];

export const serverRegionPresets = [
  { code: 'HK', zh: '中国香港 (HK)', en: 'Hong Kong (HK)' },
  { code: 'JP', zh: '日本东京/大阪 (JP)', en: 'Japan (JP)' },
  { code: 'SG', zh: '新加坡 (SG)', en: 'Singapore (SG)' },
  { code: 'US', zh: '美国西岸/东岸 (US)', en: 'United States (US)' },
  { code: 'TW', zh: '中国台湾 (TW)', en: 'Taiwan (TW)' },
  { code: 'KR', zh: '韩国首尔 (KR)', en: 'South Korea (KR)' },
  { code: 'DE', zh: '德国法兰克福 (DE)', en: 'Germany (DE)' },
  { code: 'GB', zh: '英国伦敦 (GB)', en: 'United Kingdom (GB)' },
  { code: 'NL', zh: '荷兰阿姆斯特丹 (NL)', en: 'Netherlands (NL)' },
  { code: 'CN', zh: '中国大陆 (CN)', en: 'Mainland China (CN)' },
  { code: 'LOCAL', zh: '家庭局域网 (LOCAL)', en: 'Home LAN (LOCAL)' },
] as const;

export const osPresets = [
  'Debian 13',
  'Debian 12',
  'Ubuntu 24.04 LTS',
  'Alpine Linux',
  'Rocky Linux 9',
  'Proxmox VE 8',
  'Synology DSM 7.2',
  'Unraid 7',
  'macOS Sequoia',
  'Windows Server 2022',
] as const;

export const serverTagPresets = [
  { zh: '主力反代', en: 'Reverse Proxy' },
  { zh: 'Docker 宿主', en: 'Docker Host' },
  { zh: '出口节点', en: 'Exit Node' },
  { zh: '入口中转', en: 'Transit Relay' },
  { zh: '数据备份', en: 'Backup' },
  { zh: '影音存储', en: 'Media NAS' },
  { zh: '传家宝', en: 'Grandfathered' },
  { zh: '开发测试', en: 'Dev / Staging' },
];

export const serverPresets: ServerPreset[] = [
  {
    key: 'dmit',
    iconKey: 'dmit',
    provider: { zh: 'DMIT', en: 'DMIT' },
    subtitle: { zh: '美西 / 香港 CN2 GIA 与 CMIN2 精品线路', en: 'Premium CN2 GIA & CMIN2 Cloud VPS' },
    group: 'overseas_vps',
    popular: true,
    kind: 'vps',
    region: 'US',
    defaultOs: 'Debian 12',
    defaultSshUser: 'root',
    defaultSshPort: 22,
    color: '#0284c7',
    keywords: ['dmit', '大妈', 'lax pro', 'hkg pro', 'eb', 'cn2 gia'],
    consoleUrl: 'https://www.dmit.io/clientarea.php',
    tip: {
      zh: 'DMIT 传家宝机型（如 LAX.Pro.Wee / Malin）建议在关联订阅中标记「绝版必留」，避免逾期掉机。',
      en: 'Mark grandfathered DMIT promo plans as "Keep this plan" in the linked subscription.',
    },
    plans: [
      {
        id: 'lax_pro_wee',
        label: { zh: 'LAX.Pro.Wee (1C1G · 年付特惠)', en: 'LAX.Pro.Wee (1C1G Promo)' },
        nameHint: 'LAX-DMIT-Wee',
        region: 'US',
        datacenter: 'Los Angeles Pro',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 20,
        diskType: 'ssd',
        bandwidthMbps: 500,
        trafficGb: 450,
        portNote: 'CN2 GIA · 三网回程优化',
        suggestedPrice: { amount: 36.9, currency: 'USD', cycle: 'yearly' },
      },
      {
        id: 'lax_eb_wee',
        label: { zh: 'LAX.EB.Wee (CMIN2 1C1G)', en: 'LAX.EB.Wee (CMIN2 1C1G)' },
        nameHint: 'LAX-DMIT-EB',
        region: 'US',
        datacenter: 'Los Angeles Eyeball',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 20,
        diskType: 'ssd',
        bandwidthMbps: 1000,
        trafficGb: 800,
        portNote: 'CMIN2 / AS9929 回程',
        suggestedPrice: { amount: 39.9, currency: 'USD', cycle: 'yearly' },
      },
      {
        id: 'hkg_pro',
        label: { zh: 'HKG.Pro.Tiny (香港 GIA)', en: 'HKG.Pro.Tiny (HK GIA)' },
        nameHint: 'HKG-DMIT-Pro',
        region: 'HK',
        datacenter: 'Hong Kong Pro',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 20,
        diskType: 'ssd',
        bandwidthMbps: 500,
        trafficGb: 300,
        portNote: '香港 CN2 GIA 低延迟',
      },
    ],
  },
  {
    key: 'bandwagon',
    iconKey: 'bandwagon',
    provider: { zh: '搬瓦工 BandwagonHost', en: 'BandwagonHost' },
    subtitle: { zh: 'DC6 / DC9 CN2 GIA-E · 日本软银 · 荷兰联通', en: 'CN2 GIA-E · SoftBank · KiwiVM' },
    group: 'overseas_vps',
    popular: true,
    kind: 'vps',
    region: 'US',
    defaultOs: 'Debian 12',
    defaultSshUser: 'root',
    defaultSshPort: 28192,
    color: '#2563eb',
    keywords: ['bandwagon', 'bwh', '搬瓦工', 'bwg', 'kiwivm', 'the plan', 'dc6', 'dc9'],
    consoleUrl: 'https://bwh81.net/clientarea.php',
    tip: {
      zh: 'KiwiVM 默认分配随机高位 SSH 端口，请填写真实端口号以便生成准确的本地 SSH 命令（切勿填写密码）。',
      en: 'KiwiVM assigns a random high SSH port; record the port number here (never store the password).',
    },
    plans: [
      {
        id: 'the_plan_v2',
        label: { zh: 'THE PLAN (2C2G · 多机房切换)', en: 'THE PLAN (2C2G Multi-DC)' },
        nameHint: 'BWH-ThePlan',
        region: 'US',
        datacenter: 'USCA_6 (DC6 GIA-E)',
        cpuCores: 2,
        memoryMb: 2048,
        diskGb: 40,
        diskType: 'ssd',
        bandwidthMbps: 2500,
        trafficGb: 1000,
        portNote: 'KiwiVM 自由切机房',
        suggestedPrice: { amount: 99, currency: 'USD', cycle: 'yearly' },
      },
      {
        id: 'dc6_20g',
        label: { zh: 'CN2 GIA-E 20G (2C1G)', en: 'CN2 GIA-E 20G (2C1G)' },
        nameHint: 'BWH-DC6-01',
        region: 'US',
        datacenter: 'USCA_6 (DC6)',
        cpuCores: 2,
        memoryMb: 1024,
        diskGb: 20,
        diskType: 'ssd',
        bandwidthMbps: 2500,
        trafficGb: 1000,
        portNote: 'DC6 电子商务 GIA-E',
      },
    ],
  },
  {
    key: 'hetzner',
    iconKey: 'hetzner',
    provider: { zh: 'Hetzner', en: 'Hetzner' },
    subtitle: { zh: '德国 / 芬兰高性价比独立资源云主机与独服', en: 'High-value European Cloud & Dedicated' },
    group: 'overseas_vps',
    popular: true,
    kind: 'vps',
    region: 'DE',
    defaultOs: 'Debian 12',
    defaultSshUser: 'root',
    defaultSshPort: 22,
    color: '#d50c2d',
    keywords: ['hetzner', 'hz', '赫兹纳', '德国独服', 'cx22', 'cax11'],
    consoleUrl: 'https://console.hetzner.cloud/',
    tip: {
      zh: 'Hetzner 欧区默认按出站流量计费（20 TB/月配额充足），非常适合作为 Docker 应用与存储宿主。',
      en: 'Hetzner EU instances include 20 TB/mo outbound traffic—ideal for Docker workloads and backups.',
    },
    plans: [
      {
        id: 'cx22',
        label: { zh: 'CX22 (2C4G · 40G NVMe)', en: 'CX22 (2C4G · 40G NVMe)' },
        nameHint: 'HZ-FSN1-CX22',
        region: 'DE',
        datacenter: 'Falkenstein (fsn1)',
        cpuCores: 2,
        memoryMb: 4096,
        diskGb: 40,
        diskType: 'nvme',
        bandwidthMbps: 10000,
        trafficGb: 20480,
        trafficRule: 'out_only',
        suggestedPrice: { amount: 4.5, currency: 'EUR', cycle: 'monthly' },
      },
      {
        id: 'cax11',
        label: { zh: 'CAX11 ARM64 (2C4G · Ampere)', en: 'CAX11 ARM64 (2C4G)' },
        nameHint: 'HZ-NBG1-ARM',
        region: 'DE',
        datacenter: 'Nuremberg (nbg1)',
        arch: 'arm64',
        cpuCores: 2,
        memoryMb: 4096,
        diskGb: 40,
        diskType: 'nvme',
        bandwidthMbps: 10000,
        trafficGb: 20480,
        trafficRule: 'out_only',
        suggestedPrice: { amount: 3.79, currency: 'EUR', cycle: 'monthly' },
      },
    ],
  },
  {
    key: 'racknerd',
    iconKey: 'racknerd',
    provider: { zh: 'RackNerd', en: 'RackNerd' },
    subtitle: { zh: '黑五低价年付美西 / 美东入门小鸡', en: 'Budget Annual US KVM VPS' },
    group: 'overseas_vps',
    popular: true,
    kind: 'vps',
    region: 'US',
    defaultOs: 'Debian 12',
    defaultSshUser: 'root',
    defaultSshPort: 22,
    color: '#0ea5e9',
    keywords: ['racknerd', 'rn', '黑五', '闪购', 'dc02'],
    consoleUrl: 'https://my.racknerd.com/clientarea.php',
    plans: [
      {
        id: 'rn_1c1g',
        label: { zh: '黑五特惠 1C1G ($10.98/年)', en: 'Black Friday 1C1G ($10.98/yr)' },
        nameHint: 'RN-LAX-DC02',
        region: 'US',
        datacenter: 'Los Angeles DC-02',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 20,
        diskType: 'ssd',
        bandwidthMbps: 1000,
        trafficGb: 2000,
        suggestedPrice: { amount: 10.98, currency: 'USD', cycle: 'yearly' },
      },
      {
        id: 'rn_2c2g',
        label: { zh: '黑五进阶 2C2.5G ($18.93/年)', en: 'Black Friday 2C2.5G ($18.93/yr)' },
        nameHint: 'RN-SJC-01',
        region: 'US',
        datacenter: 'San Jose',
        cpuCores: 2,
        memoryMb: 2560,
        diskGb: 40,
        diskType: 'ssd',
        bandwidthMbps: 1000,
        trafficGb: 3500,
        suggestedPrice: { amount: 18.93, currency: 'USD', cycle: 'yearly' },
      },
    ],
  },
  {
    key: 'clawcloud',
    iconKey: 'clawcloud',
    provider: { zh: 'ClawCloud', en: 'ClawCloud' },
    subtitle: { zh: '香港 / 新加坡 / 日本高带宽轻量云与 VPS', en: 'HK / SG / JP High-Bandwidth VPS' },
    group: 'overseas_vps',
    popular: true,
    kind: 'vps',
    region: 'HK',
    defaultOs: 'Debian 12',
    defaultSshUser: 'root',
    defaultSshPort: 22,
    color: '#6366f1',
    keywords: ['claw', 'clawcloud', '爪云', '香港轻量'],
    consoleUrl: 'https://claw.cloud/',
    plans: [
      {
        id: 'claw_hk_1c1g',
        label: { zh: 'HK 1C1G 1Gbps', en: 'HK 1C1G 1Gbps' },
        nameHint: 'Claw-HKG-01',
        region: 'HK',
        datacenter: 'Hong Kong',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 20,
        diskType: 'ssd',
        bandwidthMbps: 1000,
        trafficGb: 1000,
        trafficRule: 'out_only',
      },
    ],
  },
  {
    key: 'oracle',
    iconKey: 'oracle',
    provider: { zh: 'Oracle Cloud 甲骨文云', en: 'Oracle Cloud (OCI)' },
    subtitle: { zh: 'Always Free 永久免费 ARM 4C24G 与 AMD 实例', en: 'Always Free Ampere ARM & AMD VMs' },
    group: 'global_cloud',
    popular: true,
    kind: 'vps',
    region: 'JP',
    defaultOs: 'Ubuntu 24.04 LTS',
    defaultArch: 'arm64',
    defaultSshUser: 'ubuntu',
    defaultSshPort: 22,
    color: '#c74634',
    keywords: ['oracle', 'oci', '甲骨文', '乌龟壳', 'arm', '春川', '东京'],
    consoleUrl: 'https://cloud.oracle.com/',
    tip: {
      zh: '甲骨文免费实例如果 CPU/内存长期极低可能触发闲置回收；建议关联对应的 OCI 账号便于核对区服。',
      en: 'OCI Always Free instances with idle CPU/RAM may be reclaimed; link the owning OCI account for quick reference.',
    },
    plans: [
      {
        id: 'oci_arm_4c24g',
        label: { zh: 'Ampere A1 免费满配 (4C24G)', en: 'Ampere A1 Free (4C24G)' },
        nameHint: 'OCI-NRT-ARM',
        region: 'JP',
        datacenter: 'ap-tokyo-1',
        arch: 'arm64',
        cpuCores: 4,
        memoryMb: 24576,
        diskGb: 200,
        diskType: 'nvme',
        bandwidthMbps: 4000,
        trafficGb: 10240,
        trafficRule: 'out_only',
      },
      {
        id: 'oci_amd_micro',
        label: { zh: 'AMD Micro 免费机 (1C1G)', en: 'AMD E2.1.Micro Free' },
        nameHint: 'OCI-ICN-Micro',
        region: 'KR',
        datacenter: 'ap-chuncheon-1',
        arch: 'amd64',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 50,
        diskType: 'ssd',
        bandwidthMbps: 480,
        trafficGb: 10240,
        trafficRule: 'out_only',
      },
    ],
  },
  {
    key: 'aws',
    iconKey: 'aws',
    provider: { zh: 'AWS Lightsail / EC2', en: 'AWS Lightsail / EC2' },
    subtitle: { zh: '亚太新加坡 / 东京 / 首尔轻量与弹性计算', en: 'Amazon Lightsail & EC2 Instances' },
    group: 'global_cloud',
    popular: true,
    kind: 'vps',
    region: 'SG',
    defaultOs: 'Debian 12',
    defaultSshUser: 'admin',
    defaultSshPort: 22,
    color: '#ff9900',
    keywords: ['aws', 'lightsail', 'ec2', '亚马逊云', '光帆'],
    consoleUrl: 'https://lightsail.aws.amazon.com/',
    plans: [
      {
        id: 'lightsail_5',
        label: { zh: 'Lightsail $5 (2C1G · 2TB)', en: 'Lightsail $5 (2C1G · 2TB)' },
        nameHint: 'AWS-SIN-LS01',
        region: 'SG',
        datacenter: 'ap-southeast-1',
        cpuCores: 2,
        memoryMb: 1024,
        diskGb: 40,
        diskType: 'ssd',
        bandwidthMbps: 1000,
        trafficGb: 2048,
        suggestedPrice: { amount: 5, currency: 'USD', cycle: 'monthly' },
      },
    ],
  },
  {
    key: 'vultr',
    iconKey: 'vultr',
    provider: { zh: 'Vultr', en: 'Vultr' },
    subtitle: { zh: '全球 30+ 机房按小时计费云实例', en: 'Global Hourly Cloud Compute' },
    group: 'overseas_vps',
    kind: 'vps',
    region: 'JP',
    defaultOs: 'Debian 12',
    defaultSshUser: 'root',
    defaultSshPort: 22,
    color: '#007bfc',
    keywords: ['vultr', '高频云', 'tokyo', 'seoul'],
    consoleUrl: 'https://my.vultr.com/',
  },
  {
    key: 'digitalocean',
    iconKey: 'digitalocean',
    provider: { zh: 'DigitalOcean', en: 'DigitalOcean' },
    subtitle: { zh: '海外开发者常用 Droplet 云主机', en: 'Developer Cloud Droplets' },
    group: 'global_cloud',
    kind: 'vps',
    region: 'SG',
    defaultOs: 'Ubuntu 24.04 LTS',
    defaultSshUser: 'root',
    defaultSshPort: 22,
    color: '#0080ff',
    keywords: ['digitalocean', 'do', 'droplet', 'sfo', 'sgp1'],
    consoleUrl: 'https://cloud.digitalocean.com/droplets',
  },
  {
    key: 'linode',
    iconKey: 'linode',
    provider: { zh: 'Akamai / Linode', en: 'Akamai / Linode' },
    subtitle: { zh: '日本 / 新加坡 / 美西老牌稳定云主机', en: 'Akamai Connected Cloud Instances' },
    group: 'global_cloud',
    kind: 'vps',
    region: 'JP',
    defaultOs: 'Debian 12',
    defaultSshUser: 'root',
    defaultSshPort: 22,
    color: '#00a95c',
    keywords: ['linode', 'akamai', 'nanode'],
    consoleUrl: 'https://cloud.linode.com/linodes',
  },
  {
    key: 'gcp',
    iconKey: 'gcp',
    provider: { zh: 'Google Cloud (GCP)', en: 'Google Cloud (GCP)' },
    subtitle: { zh: '台湾 / 香港 Premium 网络与美西免费 e2-micro', en: 'Compute Engine · TW / HK / US Free Tier' },
    group: 'global_cloud',
    kind: 'vps',
    region: 'TW',
    defaultOs: 'Debian 12',
    defaultSshUser: 'debian',
    defaultSshPort: 22,
    color: '#4285f4',
    keywords: ['gcp', 'google cloud', '谷歌云', '彰化', 'e2-micro'],
    consoleUrl: 'https://console.cloud.google.com/compute/instances',
  },
  {
    key: 'azure',
    iconKey: 'azure',
    provider: { zh: 'Microsoft Azure', en: 'Microsoft Azure' },
    subtitle: { zh: '香港 / 日本东 B1s / B2pts ARM 虚拟机', en: 'Azure Virtual Machines · HK / JP' },
    group: 'global_cloud',
    kind: 'vps',
    region: 'HK',
    defaultOs: 'Ubuntu 24.04 LTS',
    defaultSshUser: 'azureuser',
    defaultSshPort: 22,
    color: '#0078d4',
    keywords: ['azure', 'az', '微软云', 'b1s'],
    consoleUrl: 'https://portal.azure.com/',
  },
  {
    key: 'ovh',
    iconKey: 'ovh',
    provider: { zh: 'OVHcloud', en: 'OVHcloud' },
    subtitle: { zh: '高防无限流量欧洲 / 新加坡 VPS 与独服', en: 'DDoS-Protected Unmetered VPS & Dedicated' },
    group: 'overseas_vps',
    kind: 'dedicated',
    region: 'DE',
    defaultOs: 'Debian 12',
    defaultSshUser: 'debian',
    defaultSshPort: 22,
    color: '#000e9c',
    keywords: ['ovh', 'kimsufi', 'soyoustart', '高防', '独服'],
    consoleUrl: 'https://www.ovh.com/manager/',
  },
  {
    key: 'aliyun',
    iconKey: 'aliyun',
    provider: { zh: '阿里云 ECS / 轻量', en: 'Alibaba Cloud' },
    subtitle: { zh: '国内备案建站 · 香港 / 新加坡 200M 峰值轻量云', en: 'Domestic ECS & 200Mbps Simple App Server' },
    group: 'domestic_cloud',
    popular: true,
    kind: 'vps',
    region: 'CN',
    defaultOs: 'Debian 12',
    defaultSshUser: 'root',
    defaultSshPort: 22,
    color: '#ff6a00',
    keywords: ['aliyun', 'alibaba', '阿里云', '轻量应用服务器', 'ecs', '99元'],
    consoleUrl: 'https://swasnext.console.aliyun.com/',
    tip: {
      zh: '国内 99 元/年经济型 ECS 若首年促销、续费涨价，记得在关联订阅中填写「续费原价」预警。',
      en: 'For promotional domestic ECS plans, record the standard renewal price on the linked subscription.',
    },
    plans: [
      {
        id: 'ecs_99',
        label: { zh: 'ECS 经济型 e (2C2G · 3M 固定带宽)', en: 'ECS e-series (2C2G · 3Mbps)' },
        nameHint: 'Ali-HZ-ECS01',
        region: 'CN',
        datacenter: '华东1（杭州）',
        cpuCores: 2,
        memoryMb: 2048,
        diskGb: 40,
        diskType: 'ssd',
        bandwidthMbps: 3,
        trafficGb: 0,
        trafficRule: 'unlimited',
        suggestedPrice: { amount: 99, currency: 'CNY', cycle: 'yearly' },
      },
      {
        id: 'swas_hk_200m',
        label: { zh: '香港轻量 200M 峰值 (2C2G)', en: 'HK Simple Server 200Mbps (2C2G)' },
        nameHint: 'Ali-HK-SWAS',
        region: 'HK',
        datacenter: '中国香港',
        cpuCores: 2,
        memoryMb: 2048,
        diskGb: 40,
        diskType: 'nvme',
        bandwidthMbps: 200,
        trafficGb: 0,
        trafficRule: 'unlimited',
        suggestedPrice: { amount: 28, currency: 'CNY', cycle: 'monthly' },
      },
    ],
  },
  {
    key: 'tencent_cloud',
    iconKey: 'tencent_cloud',
    provider: { zh: '腾讯云 轻量 / CVM', en: 'Tencent Cloud Lighthouse' },
    subtitle: { zh: '上海 / 广州 / 硅谷 / 东京轻量应用服务器', en: 'Lighthouse & CVM Cloud Servers' },
    group: 'domestic_cloud',
    popular: true,
    kind: 'vps',
    region: 'CN',
    defaultOs: 'Debian 12',
    defaultSshUser: 'ubuntu',
    defaultSshPort: 22,
    color: '#0052d9',
    keywords: ['tencent', 'lighthouse', '腾讯云', '良心云', '轻量', 'cvm'],
    consoleUrl: 'https://console.cloud.tencent.com/lighthouse',
    plans: [
      {
        id: 'lh_2c2g_4m',
        label: { zh: '国内轻量 2C2G 4M (300G/月)', en: 'CN Lighthouse 2C2G 4Mbps' },
        nameHint: 'TX-SHA-LH01',
        region: 'CN',
        datacenter: '上海',
        cpuCores: 2,
        memoryMb: 2048,
        diskGb: 50,
        diskType: 'ssd',
        bandwidthMbps: 4,
        trafficGb: 300,
        trafficRule: 'out_only',
      },
    ],
  },
  {
    key: 'proxmox',
    iconKey: 'proxmox',
    provider: { zh: 'Proxmox VE 宿主', en: 'Proxmox VE Host' },
    subtitle: { zh: '小主机 / 软路由 All-in-One 虚拟化节点', en: 'HomeLab Hypervisor & LXC/VM Host' },
    group: 'homelab_nas',
    popular: true,
    kind: 'homelab',
    region: 'LOCAL',
    defaultOs: 'Proxmox VE 8',
    defaultSshUser: 'root',
    defaultSshPort: 22,
    color: '#e57000',
    keywords: ['pve', 'proxmox', 'homelab', '小主机', 'n100', '软路由', 'all in one'],
    tip: {
      zh: '家庭内网设备可填写局域网或 Tailscale 组网 IP，计费方式选「自有 / 无周期账单」即可。',
      en: 'Record your LAN or Tailscale IP for HomeLab nodes and set billing to "Self-owned / No recurring bill".',
    },
    plans: [
      {
        id: 'n100_minipc',
        label: { zh: 'N100 准系统小主机 (4C16G)', en: 'Intel N100 Mini PC (4C16G)' },
        nameHint: 'Home-PVE-N100',
        region: 'LOCAL',
        datacenter: '家庭弱电箱',
        cpuCores: 4,
        memoryMb: 16384,
        diskGb: 512,
        diskType: 'nvme',
        bandwidthMbps: 2500,
        trafficGb: 0,
        trafficRule: 'unlimited',
      },
      {
        id: 'ms01_workstation',
        label: { zh: '高配虚拟化工作站 (14C64G · 万兆)', en: '10GbE HomeLab Server (14C64G)' },
        nameHint: 'Home-PVE-Core',
        region: 'LOCAL',
        datacenter: '书房机柜',
        cpuCores: 14,
        memoryMb: 65536,
        diskGb: 2048,
        diskType: 'nvme',
        bandwidthMbps: 10000,
        trafficGb: 0,
        trafficRule: 'unlimited',
      },
    ],
  },
  {
    key: 'synology',
    iconKey: 'synology',
    provider: { zh: '群晖 Synology NAS', en: 'Synology NAS' },
    subtitle: { zh: '家庭私有云盘、相册备份与 Docker 容器存储', en: 'DSM Private Storage, Photos & Containers' },
    group: 'homelab_nas',
    popular: true,
    kind: 'nas',
    region: 'LOCAL',
    defaultOs: 'Synology DSM 7.2',
    defaultSshUser: 'admin',
    defaultSshPort: 22,
    color: '#0284c7',
    keywords: ['synology', 'dsm', 'nas', '群晖', '黑群晖', 'ds923', 'ds224'],
    plans: [
      {
        id: 'ds923_raid',
        label: { zh: '四盘位主力存储池 (RAID5 / SHR)', en: '4-Bay SHR Storage Pool' },
        nameHint: 'Home-NAS-DSM',
        region: 'LOCAL',
        datacenter: '家庭局域网',
        cpuCores: 4,
        memoryMb: 8192,
        diskGb: 16384,
        diskType: 'raid',
        bandwidthMbps: 2500,
        trafficGb: 0,
        trafficRule: 'unlimited',
      },
    ],
  },
  {
    key: 'unraid',
    iconKey: 'unraid',
    provider: { zh: 'Unraid / TrueNAS', en: 'Unraid / TrueNAS' },
    subtitle: { zh: 'DIY 多盘位阵列、影音库与虚拟机存储服务器', en: 'DIY Storage Array & Media Server' },
    group: 'homelab_nas',
    kind: 'nas',
    region: 'LOCAL',
    defaultOs: 'Unraid 7',
    defaultSshUser: 'root',
    defaultSshPort: 22,
    color: '#f15a2c',
    keywords: ['unraid', 'truenas', 'zfs', '飞牛', 'fnos', '影音库'],
  },
  {
    key: 'mac_mini',
    iconKey: 'apple_mac',
    provider: { zh: 'Mac mini 常驻主机', en: 'Mac mini Home Server' },
    subtitle: { zh: '低功耗静音 Apple Silicon 家庭构建与网关节点', en: 'Low-Power Apple Silicon Home Server' },
    group: 'homelab_nas',
    kind: 'homelab',
    region: 'LOCAL',
    defaultOs: 'macOS Sequoia',
    defaultArch: 'arm64',
    defaultSshUser: 'admin',
    defaultSshPort: 22,
    color: '#334155',
    darkInvert: true,
    keywords: ['mac mini', 'm4', 'm2', 'apple silicon', '苹果主机'],
  },
];

const presetsByKey = new Map(serverPresets.map(item => [item.key, item]));

export function findServerPreset(key?: string): ServerPreset | undefined {
  if (!key) return undefined;
  return presetsByKey.get(key);
}

export function resolveServerPreset(value: Pick<ServerHost, 'presetKey' | 'provider' | 'name'>): ServerPreset | undefined {
  if (value.presetKey) {
    const direct = presetsByKey.get(value.presetKey);
    if (direct) return direct;
  }
  const hay = `${value.provider} ${value.name}`.trim().toLowerCase();
  if (!hay) return undefined;
  return serverPresets.find(preset =>
    preset.provider.zh.toLowerCase() === hay
    || preset.provider.en.toLowerCase() === hay
    || preset.keywords.some(kw => kw.length >= 3 && hay.includes(kw.toLowerCase())),
  );
}

export function filterServerPresets(query: string, group: ServerPresetGroup): ServerPreset[] {
  const q = query.trim().toLowerCase();
  return serverPresets.filter((preset) => {
    if (q) {
      const hay = [
        preset.key,
        preset.provider.zh,
        preset.provider.en,
        preset.subtitle.zh,
        preset.subtitle.en,
        ...preset.keywords,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    }
    if (group === 'popular') return Boolean(preset.popular);
    return preset.group === group;
  });
}
