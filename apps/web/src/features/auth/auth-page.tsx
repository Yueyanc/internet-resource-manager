import { authOptions, signIn } from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from '@tanstack/react-router';
import { Alert, Button, Card, Form, Input } from 'antd';
import { ArrowRight, LockKeyhole, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';

import { usePreferences } from '../../app/preferences-context';
import { ColorModeButton, LanguageSwitcher } from '../../shared/appearance-controls';
import { BrandLogo } from '../../shared/brand-logo';
import { errorMessage } from '../../shared/errors';
import { Loading, QueryError } from '../../shared/feedback';
import { updateSession } from '../../shared/session';
export function AuthPage({ mode }: {
  mode: 'setup' | 'login';
}) {
  const { t, locale } = usePreferences();
  const auth = useQuery(authOptions);

  const client = useQueryClient();

  const [cooldown, setCooldown] = useState(0);

  const mutation = useMutation({
    mutationFn: (values: {
      username: string;
      password: string;
    }) => signIn(mode, { username: values.username, password: values.password }),
    onSuccess: value => updateSession(client, value),
    onError: (error) => {
      if ('code' in error && error.code === 'rate_limited')
        setCooldown(60);
    },
  });

  useEffect(() => {
    if (cooldown === 0)
      return;

    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);

    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (auth.isError)
    return (
      <div className="auth-state">
        <QueryError
          title={t('无法读取平台状态')}
          error={auth.error}
          retry={() => {
            void auth.refetch();
          }}
        />
      </div>
    );

  if (!auth.data)
    return <Loading />;

  if (auth.data.user)
    return <Navigate to="/subscriptions" replace />;

  if (!auth.data.initialized && mode === 'login')
    return <Navigate to="/setup" replace />;

  if (auth.data.initialized && mode === 'setup')
    return <Navigate to="/login" replace />;

  const setup = mode === 'setup';

  return (
    <main className="auth-layout">
      <div className="auth-tools">
        <ColorModeButton />
        <LanguageSwitcher />
      </div>
      <div className="auth-brand">
        <span className="brand-mark"><BrandLogo size={30} /></span>
        <span>
          IRM
          <span className="brand-divider">/</span>
          {' '}
          {t('资源管家')}
        </span>
      </div>
      <Card className="auth-panel">
        <span className="auth-lock"><LockKeyhole size={23} strokeWidth={1.6} /></span>
        <h1>{setup ? t('创建你的私人工作台') : t('欢迎回来')}</h1>
        <p>{setup ? t('创建管理员账号，开始管理你的互联网资源。') : t('登录资源管家，查看你的订阅与资源。')}</p>
        {mutation.isError && <Alert className="mb-5" type="error" showIcon title={errorMessage(mutation.error, locale)} />}
        <Form layout="vertical" requiredMark={false} initialValues={setup ? { username: 'admin' } : undefined} onFinish={values => mutation.mutate(values)} disabled={mutation.isPending}>
          <Form.Item name="username" label={setup ? t('管理员用户名') : t('用户名')} rules={[{ required: true, message: t('请输入用户名') }, ...(setup ? [{ pattern: /^[a-zA-Z0-9_.-]{3,32}$/, message: t('使用 3–32 位字母、数字或 ._-') }] : [])]}>
            <Input prefix={<UserRound size={16} className="text-gray-400" />} autoComplete="username" size="large" maxLength={32} />
          </Form.Item>
          <Form.Item name="password" label={t('登录密码')} rules={[{ required: true, message: t('请输入密码') }, ...(setup ? [{ min: 8, message: t('密码至少 8 位') }, { max: 256, message: t('密码过长') }] : [])]}>
            <Input.Password prefix={<LockKeyhole size={16} className="text-gray-400" />} autoComplete={setup ? 'new-password' : 'current-password'} size="large" maxLength={256} />
          </Form.Item>
          {setup && <Form.Item name="confirm" label={t('确认登录密码')} dependencies={['password']} rules={[{ required: true, message: t('请再次输入密码') }, ({ getFieldValue }) => ({ validator: (_, value: string) => value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error(t('两次密码不一致'))) })]}><Input.Password size="large" autoComplete="new-password" /></Form.Item>}
          <Button type="primary" htmlType="submit" block size="large" loading={mutation.isPending} disabled={cooldown > 0} icon={<ArrowRight size={17} />} iconPlacement="end">{cooldown ? t('{count} 秒后重试', { count: cooldown }) : setup ? t('完成初始化并进入') : t('登录')}</Button>
        </Form>
      </Card>
      <div className="auth-footer">
        <span className="status-dot" />
        {t('私有数据 · 本机存储')}
      </div>
    </main>
  );
}
