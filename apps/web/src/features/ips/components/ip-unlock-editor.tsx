import { type IpUnlockEntry, type IpUnlockService, ipUnlockServices, type IpUnlockState } from '@irm/api-client';

import { usePreferences } from '../../../app/preferences-context';
import { ipUnlockMeta } from '../utils/ip-metrics';
import { UnlockServiceIcon } from './ip-mark';

const states: { value: IpUnlockState; labelKey: '未测' | '全解锁' | '仅自制 / 受限' | '不可用' }[] = [
  { value: 'unknown', labelKey: '未测' },
  { value: 'full', labelKey: '全解锁' },
  { value: 'partial', labelKey: '仅自制 / 受限' },
  { value: 'blocked', labelKey: '不可用' },
];

export function IpUnlockEditor({
  value = {},
  defaultRegion,
  onChange,
}: {
  value?: Record<string, IpUnlockEntry>;
  defaultRegion?: string;
  onChange?: (next: Record<string, IpUnlockEntry>) => void;
}) {
  const { t } = usePreferences();

  const updateState = (service: IpUnlockService, status: IpUnlockState) => {
    const next = { ...value };
    if (status === 'unknown') {
      delete next[service];
    }
    else {
      const prevRegion = next[service]?.region;
      const cleanDefault = defaultRegion && defaultRegion !== 'LAN' && defaultRegion !== 'GLOBAL' ? defaultRegion : undefined;
      next[service] = {
        status,
        ...(prevRegion ? { region: prevRegion } : cleanDefault && status === 'full' ? { region: cleanDefault } : {}),
      };
    }
    onChange?.(next);
  };

  return (
    <div className="ip-unlock-editor" role="group" aria-label={t('AI 与流媒体解锁')}>
      {ipUnlockServices.map((service) => {
        const meta = ipUnlockMeta[service];
        const current: IpUnlockState = value[service]?.status ?? 'unknown';
        return (
          <div key={service} className="ip-unlock-editor-row">
            <div className="ip-unlock-editor-service">
              <UnlockServiceIcon service={service} />
              <span>{meta.label}</span>
            </div>
            <div className="ip-unlock-state-pills">
              {states.map((item) => {
                const active = current === item.value;
                const stateLabel = t(item.labelKey);
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-label={`${meta.label} ${stateLabel}`}
                    aria-pressed={active}
                    className={`ip-unlock-pill state-${item.value} ${active ? 'is-active' : ''}`}
                    onClick={() => updateState(service, item.value)}
                  >
                    {stateLabel}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
