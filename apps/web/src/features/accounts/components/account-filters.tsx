import { Button, Popover, Select, Tooltip } from 'antd';
import { ListFilter, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { accountCategoryMeta } from '../utils/account-metrics';

export function AccountFilters({
  status,
  category,
  region,
  regions,
  onStatus,
  onCategory,
  onRegion,
}: {
  status: string;
  category: string;
  region: string;
  regions: string[];
  onStatus: (value: string) => void;
  onCategory: (value: string) => void;
  onRegion: (value: string) => void;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const active = status !== 'all' || category !== 'all' || region !== 'all';

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      content={(
        <div className="filter-panel">
          <label>{t('账号状态')}</label>
          <Select
            aria-label={t('账号状态')}
            value={status}
            onChange={onStatus}
            options={[
              { value: 'all', label: t('全部') },
              { value: 'checkin_soon', label: t('保活临期（30天内）') },
              { value: 'weak_security', label: t('安全待加固项') },
              { value: 'kyc_verified', label: t('已实名账号') },
              { value: 'retiring', label: t('计划注销') },
              { value: 'restricted', label: t('风控受限') },
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
              ...Object.entries(accountCategoryMeta).map(([value, item]) => ({ value, label: t(item.label) })),
            ]}
          />
          <label>{t('区服 / 地区')}</label>
          <Select
            aria-label={t('区服 / 地区')}
            value={region}
            onChange={onRegion}
            options={[
              { value: 'all', label: t('全部区服') },
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
