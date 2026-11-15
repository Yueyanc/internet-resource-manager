import { Button, Popover, Select, Tooltip } from 'antd';
import { ListFilter, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { ipAsnTypeMeta, ipCategoryMeta } from '../utils/ip-metrics';

export function IpFilters({
  status,
  category,
  asnType,
  originType,
  region,
  regions,
  onStatus,
  onCategory,
  onAsnType,
  onOriginType,
  onRegion,
}: {
  status: string;
  category: string;
  asnType: string;
  originType: string;
  region: string;
  regions: string[];
  onStatus: (value: string) => void;
  onCategory: (value: string) => void;
  onAsnType: (value: string) => void;
  onOriginType: (value: string) => void;
  onRegion: (value: string) => void;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const active = status !== 'all' || category !== 'all' || asnType !== 'all' || originType !== 'all' || region !== 'all';

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      content={(
        <div className="filter-panel">
          <label>{t('节点状态')}</label>
          <Select
            aria-label={t('节点状态')}
            value={status}
            onChange={onStatus}
            options={[
              { value: 'all', label: t('全部') },
              { value: 'review_soon', label: t('复检临期（30天内）') },
              { value: 'unhealthy', label: t('风控或连通异常') },
              { value: 'retiring', label: t('计划迁移') },
              { value: 'archived', label: t('已归档') },
            ]}
          />
          <label>{t('所属分类')}</label>
          <Select
            aria-label={t('筛选分类')}
            value={category}
            onChange={onCategory}
            options={[
              { value: 'all', label: t('全部分类') },
              ...Object.entries(ipCategoryMeta).map(([value, item]) => ({ value, label: t(item.label) })),
            ]}
          />
          <label>{t('ASN 属性')}</label>
          <Select
            aria-label={t('ASN 属性')}
            value={asnType}
            onChange={onAsnType}
            options={[
              { value: 'all', label: t('全部属性') },
              ...Object.entries(ipAsnTypeMeta).map(([value, item]) => ({ value, label: t(item.label) })),
            ]}
          />
          <label>{t('原生 / 广播')}</label>
          <Select
            aria-label={t('原生 / 广播')}
            value={originType}
            onChange={onOriginType}
            options={[
              { value: 'all', label: t('全部来源') },
              { value: 'native', label: t('原生 IP') },
              { value: 'broadcast', label: t('广播 IP') },
              { value: 'unknown', label: t('未核验') },
            ]}
          />
          <label>{t('国家 / 地区')}</label>
          <Select
            aria-label={t('国家 / 地区')}
            value={region}
            onChange={onRegion}
            options={[
              { value: 'all', label: t('全部地区') },
              ...regions.map(code => ({ value: code, label: code })),
            ]}
          />
          <div className="filter-panel-actions">
            <Button
              type="text"
              icon={<RotateCcw size={13} />}
              onClick={() => {
                onStatus('all');
                onCategory('all');
                onAsnType('all');
                onOriginType('all');
                onRegion('all');
              }}
            >
              {t('重置筛选')}
            </Button>
            <Button size="small" onClick={() => setOpen(false)}>{t('关闭')}</Button>
          </div>
        </div>
      )}
    >
      <Tooltip title={t('筛选')}>
        <Button className={`round-tool ${active ? 'is-active' : ''}`} aria-label={t('筛选')} icon={<ListFilter size={17} />} />
      </Tooltip>
    </Popover>
  );
}
