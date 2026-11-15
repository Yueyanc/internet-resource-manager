import { Result } from 'antd';

import { usePreferences } from '../app/preferences-context';

export function NotFound() {
  const { t } = usePreferences();
  return <Result status="404" title={t('页面不存在')} />;
}
