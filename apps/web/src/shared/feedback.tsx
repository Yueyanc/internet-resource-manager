import { Alert, Button, Spin } from 'antd';

import { usePreferences } from '../app/preferences-context';
import { errorMessage } from './errors';
export function QueryError({ title, error, retry }: {
  title: string;
  error: unknown;
  retry: () => void;
}) {
  const { locale, t } = usePreferences();
  return <Alert type="error" showIcon title={title} description={errorMessage(error, locale)} action={<Button onClick={retry}>{t('重试')}</Button>} />;
}
export function Loading() {
  return <div className="loading-state"><Spin /></div>;
}
