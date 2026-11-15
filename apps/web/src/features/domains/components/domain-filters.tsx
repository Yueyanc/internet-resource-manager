import { Button, Popover, Select, Tooltip } from 'antd';
import { ListFilter, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { domainIcpMeta, domainPurposeMeta } from '../utils/domain-metrics';

export function DomainFilters({
  status,
  purpose,
  icp,
  tld,
  tlds,
  onStatus,
  onPurpose,
  onIcp,
  onTld,
}: {
  status: string;
  purpose: string;
  icp: string;
  tld: string;
  tlds: string[];
  onStatus: (value: string) => void;
  onPurpose: (value: string) => void;
  onIcp: (value: string) => void;
  onTld: (value: string) => void;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const active = status !== 'all' || purpose !== 'all' || icp !== 'all' || tld !== 'all';

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      content={(
        <div className="filter-panel">
          <label>{t('域名状态')}</label>
          <Select
            aria-label={t('域名状态')}
            value={status}
            onChange={onStatus}
            options={[
              { value: 'all', label: t('全部') },
              { value: 'expiring', label: t('临期续费（60天内）') },
              { value: 'active', label: t('正常解析') },
              { value: 'parked', label: t('停放备用') },
              { value: 'transferring', label: t('转入 / 转移中') },
              { value: 'retiring', label: t('计划释放 / 不续费') },
              { value: 'archived', label: t('已归档') },
            ]}
          />
          <label>{t('域名用途')}</label>
          <Select
            aria-label={t('筛选用途')}
            value={purpose}
            onChange={onPurpose}
            options={[
              { value: 'all', label: t('全部用途') },
              ...Object.entries(domainPurposeMeta).map(([value, item]) => ({
                value,
                label: t(item.label),
              })),
            ]}
          />
          <label>{t('备案与合规')}</label>
          <Select
            aria-label={t('备案与合规')}
            value={icp}
            onChange={onIcp}
            options={[
              { value: 'all', label: t('全部状态') },
              ...Object.entries(domainIcpMeta).map(([value, item]) => ({
                value,
                label: t(item.label),
              })),
            ]}
          />
          <label>{t('顶级后缀')}</label>
          <Select
            aria-label={t('顶级后缀')}
            value={tld}
            onChange={onTld}
            options={[
              { value: 'all', label: t('全部后缀') },
              ...tlds.map(suffix => ({ value: suffix, label: suffix })),
            ]}
          />
          <div className="filter-panel-actions">
            <Button
              type="text"
              icon={<RotateCcw size={13} />}
              onClick={() => {
                onStatus('all');
                onPurpose('all');
                onIcp('all');
                onTld('all');
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
