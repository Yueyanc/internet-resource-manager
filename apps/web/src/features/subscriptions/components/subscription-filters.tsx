import type { Account } from '@irm/api-client';
import { Button, Popover, Select, Tooltip } from 'antd';
import { ListFilter, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import { categories } from '../utils/subscription-metrics';

export function SubscriptionFilters({
  status,
  category,
  accountId,
  accounts,
  onStatus,
  onCategory,
  onAccountId,
}: {
  status: string;
  category: string;
  accountId: string;
  accounts: Account[];
  onStatus: (value: string) => void;
  onCategory: (value: string) => void;
  onAccountId: (value: string) => void;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const active = (status !== 'all' && status !== 'soon') || category !== 'all' || accountId !== 'all';

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      content={(
        <div className="filter-panel">
          <label>{t('订阅状态')}</label>
          <Select
            aria-label={t('订阅状态')}
            value={status}
            onChange={onStatus}
            options={[
              { value: 'all', label: t('全部') },
              { value: 'soon', label: t('30天内到期') },
              { value: 'auto', label: t('自动续费') },
              { value: 'manual', label: t('手动续费') },
              { value: 'cancel', label: t('到期必退') },
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
              ...Object.entries(categories).map(([value, item]) => ({ value, label: t(item.label) })),
            ]}
          />
          <label>{t('关联上游账号')}</label>
          <Select
            aria-label={t('筛选上游账号')}
            showSearch
            optionFilterProp="label"
            value={accountId}
            onChange={onAccountId}
            options={[
              { value: 'all', label: t('全部上游账号') },
              { value: 'unlinked', label: t('未关联库内账号') },
              ...accounts.filter(item => !item.archived).map(item => ({
                value: item.id,
                label: `${accountDisplayTitle(item)} (${item.identifier})`,
              })),
            ]}
          />
          <div className="filter-panel-actions">
            <Button
              type="text"
              icon={<RotateCcw size={13} />}
              onClick={() => {
                onStatus('all');
                onCategory('all');
                onAccountId('all');
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
