import { currencies, type Preferences, preferencesOptions, savePreferences } from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, InputNumber, Modal, Select } from 'antd';
import { Save } from 'lucide-react';

import { usePreferences } from '../../app/preferences-context';
import { errorMessage } from '../../shared/errors';
import { Loading, QueryError } from '../../shared/feedback';
export function PreferencesModal({ onClose }: {
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const query = useQuery(preferencesOptions);

  return (
    <Modal title={t('汇率与偏好设置')} open onCancel={onClose} footer={null} width={480}>
      {query.isError
        ? (
            <QueryError
              title={t('无法加载偏好')}
              error={query.error}
              retry={() => {
                void query.refetch();
              }}
            />
          )
        : query.data ? <PreferencesForm value={query.data} onClose={onClose} /> : <Loading />}
    </Modal>
  );
}
function PreferencesForm({ value, onClose }: {
  value: Preferences;
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const client = useQueryClient();

  const { message } = App.useApp();

  const save = useMutation({ mutationFn: savePreferences, onSuccess: async () => {
    await client.invalidateQueries({ queryKey: ['preferences'] });

    void message.success(t('偏好已保存'));

    onClose();
  } });

  return (
    <Form layout="vertical" className="mt-5" initialValues={value} onFinish={values => save.mutate(values)} disabled={save.isPending} requiredMark={false}>
      <Alert type="info" title={t('手动参考汇率，非实时行情')} description={t('以下汇率均为 1 单位外币折合的人民币金额。保存后按所选本位币统一折算。')} className="mb-5" />
      {save.isError && <Alert type="error" title={errorMessage(save.error, locale)} className="mb-5" />}
      <Form.Item name="baseCurrency" label={t('本位币')}><Select options={currencies.map(value => ({ value, label: value }))} /></Form.Item>
      <div className="form-grid">{currencies.map(currency => <Form.Item key={currency} label={`1 ${currency} = CNY`} name={['rates', currency]} rules={[{ required: true, message: t('请输入汇率') }, { type: 'number', min: 0.000001, max: 1000000, message: t('请输入大于 0 的有效汇率') }]}><InputNumber disabled={currency === 'CNY'} min={0.000001} max={1000000} precision={6} className="w-full" /></Form.Item>)}</div>
      <Button type="primary" htmlType="submit" icon={<Save size={15} />} loading={save.isPending} block>{t('保存偏好')}</Button>
    </Form>
  );
}
