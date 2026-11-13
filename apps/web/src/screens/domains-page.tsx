import { createDomain, deleteDomain, type Domain, domainsOptions, healthOptions } from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Space, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { Blocks, ChevronRight, CircleCheck, CircleHelp, Database, Globe, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export function DomainsPage() {
  const health = useQuery(healthOptions);
  const domains = useQuery(domainsOptions);
  const client = useQueryClient();
  const { message } = App.useApp();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [form] = Form.useForm<{ name: string; notes?: string }>();
  const create = useMutation({
    mutationFn: createDomain,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: domainsOptions.queryKey });
      setOpen(false);
      form.resetFields();
      void message.success('域名已添加');
    },
    onError: (error) => { void message.error(errorMessage(error)); },
  });
  const remove = useMutation({
    mutationFn: deleteDomain,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: domainsOptions.queryKey });
      void message.success('域名已删除');
    },
    onError: (error) => { void message.error(errorMessage(error)); },
  });
  const rows = domains.data?.items.filter(domain => `${domain.name} ${domain.notes}`.toLowerCase().includes(search.toLowerCase()));
  const total = domains.data?.items.length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Blocks className="brand-icon" size={25} strokeWidth={1.8} />
          <span>资源台账</span>
        </div>
        <nav aria-label="资源导航">
          <div className="nav-label">资源管理</div>
          <Link to="/domains" className="nav-item">
            <Globe size={18} />
            域名
          </Link>
        </nav>
        <div className="sidebar-footer">INTERNET RESOURCE MANAGER</div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>资源管理</span>
            <ChevronRight size={14} />
            <span className="text-gray-700">域名</span>
          </div>
          <Space size={8}>
            <Tag color={health.isSuccess ? 'green' : 'default'} icon={health.isSuccess ? <CircleCheck size={13} /> : <CircleHelp size={13} />}>
              {health.isSuccess ? '服务已连接' : health.isPending ? '连接中' : '服务不可用'}
            </Tag>
            {health.data?.capabilities.auth === false ? <Tag color="gold">本地开发</Tag> : null}
          </Space>
        </header>
        <main className="page">
          <div className="page-heading">
            <h1>域名资源</h1>
            <Button type="primary" icon={<Plus size={17} />} disabled={!domains.isSuccess} onClick={() => setOpen(true)}>添加域名</Button>
          </div>
          <section className="summary-strip" aria-label="域名概况">
            <div className="summary-item">
              <span className="summary-label">
                <Globe size={15} />
                域名总数
              </span>
              <strong className="summary-value">{total ?? '—'}</strong>
            </div>
            <div className="summary-item">
              <span className="summary-label">
                <ShieldCheck size={15} />
                到期检查
              </span>
              <strong className="summary-value text-gray-400">未接入</strong>
            </div>
            <div className="summary-item">
              <span className="summary-label">
                <Database size={15} />
                数据存储
              </span>
              <strong className="summary-value">{health.isSuccess ? 'SQLite' : '—'}</strong>
            </div>
          </section>
          {domains.isError
            ? (
                <Alert type="error" title="无法加载域名" description={errorMessage(domains.error)} action={<Button onClick={() => { void domains.refetch(); }}>重试</Button>} className="mb-5" />
              )
            : null}
          <div className="table-toolbar">
            <Input aria-label="搜索域名" prefix={<Search size={16} className="text-gray-400" />} placeholder="搜索域名或备注" value={search} onChange={event => setSearch(event.target.value)} allowClear className="max-w-80" />
            <Tooltip title="刷新列表">
              <Button
                aria-label="刷新列表"
                icon={<RefreshCw size={16} />}
                loading={domains.isFetching}
                onClick={() => {
                  void domains.refetch();
                  void health.refetch();
                }}
              />
            </Tooltip>
          </div>
          <section className="table-region" aria-label="域名列表">
            <Table<Domain>
              rowKey="id"
              loading={domains.isPending}
              dataSource={rows}
              scroll={{ x: 680 }}
              pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
              locale={{ emptyText: (
                <div className="empty-state">
                  <span className="empty-icon"><Globe size={26} strokeWidth={1.4} /></span>
                  <span>{domains.isError ? '数据不可用' : search ? '没有匹配的域名' : '暂无域名'}</span>
                </div>
              ) }}
              columns={[
                { title: '域名', dataIndex: 'name', width: 250, render: (name: string) => <span className="domain-name">{name}</span> },
                { title: '备注', dataIndex: 'notes', ellipsis: true, render: (notes: string) => notes || <span className="text-gray-400">—</span> },
                { title: '添加时间', dataIndex: 'createdAt', width: 160, render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
                {
                  title: '操作', width: 70, align: 'center',
                  render: (_, domain) => (
                    <Popconfirm title={`删除 ${domain.name}？`} description="此操作不可撤销" okText="删除" cancelText="取消" onOpenChange={value => setConfirmingId(value ? domain.id : null)} onConfirm={() => remove.mutate(domain.id)} okButtonProps={{ danger: true, loading: remove.isPending }} icon={<CircleHelp size={16} />}>
                      <Tooltip title="删除域名" open={confirmingId === domain.id ? false : undefined}><Button type="text" danger aria-label={`删除 ${domain.name}`} icon={<Trash2 size={16} />} disabled={remove.isPending} /></Tooltip>
                    </Popconfirm>
                  ),
                },
              ]}
            />
          </section>
        </main>
      </div>
      <Modal title="添加域名" open={open} onCancel={() => { if (!create.isPending) setOpen(false); }} footer={null} width={480} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={values => create.mutate({ name: values.name.trim(), notes: values.notes?.trim() ?? '' })} className="mt-6" requiredMark={false}>
          <Form.Item name="name" label="域名" rules={[{ required: true, whitespace: true, message: '请输入域名' }, { max: 253, message: '域名过长' }]}>
            <Input placeholder="example.com" autoComplete="off" autoFocus disabled={create.isPending} />
          </Form.Item>
          <Form.Item name="notes" label="备注" rules={[{ max: 2000, message: '备注不能超过 2000 个字符' }]}><Input.TextArea rows={3} maxLength={2000} disabled={create.isPending} /></Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)} disabled={create.isPending}>取消</Button>
            <Button type="primary" htmlType="submit" loading={create.isPending}>添加</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
