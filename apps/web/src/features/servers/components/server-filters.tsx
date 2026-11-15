import { Button, Popover, Select, Tooltip } from 'antd';
import { ListFilter, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { serverKindMeta } from '../utils/server-metrics';

export function ServerFilters({
  status,
  kind,
  region,
  regions,
  onStatus,
  onKind,
  onRegion,
}: {
  status: string;
  kind: string;
  region: string;
  regions: string[];
  onStatus: (value: string) => void;
  onKind: (value: string) => void;
  onRegion: (value: string) => void;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const active = status !== 'all' || kind !== 'all' || region !== 'all';

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      content={(
        <div className="filter-panel">
          <label>{t('运行状态')}</label>
          <Select
            aria-label={t('运行状态')}
            value={status}
            onChange={onStatus}
            options={[
              { value: 'all', label: t('全部状态') },
              { value: 'expiring_soon', label: t('到期临期（30天内）') },
              { value: 'keep', label: t('绝版传家宝') },
              { value: 'active', label: t('主力在役') },
              { value: 'standby', label: t('冷备待命') },
              { value: 'maintenance', label: t('维护调试') },
              { value: 'retiring', label: t('计划退役') },
              { value: 'archived', label: t('已归档') },
            ]}
          />
          <label>{t('服务器类型')}</label>
          <Select
            aria-label={t('服务器类型')}
            value={kind}
            onChange={onKind}
            options={[
              { value: 'all', label: t('全部类型') },
              ...Object.entries(serverKindMeta).map(([value, item]) => ({ value, label: t(item.label) })),
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
                onKind('all');
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
