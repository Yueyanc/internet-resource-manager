import { Button, Dropdown, Tooltip } from 'antd';
import { Languages, Moon, Sun } from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../app/preferences-context';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = usePreferences();
  const [open, setOpen] = useState(false);
  return (
    <Dropdown
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
      menu={{ selectedKeys: [locale], items: [{ key: 'zh-CN', label: '简体中文' }, { key: 'en-US', label: 'English' }], onClick: ({ key }) => {
        setLocale(key as 'zh-CN' | 'en-US');
        setOpen(false);
      } }}
    >
      <Tooltip title={t('语言')} open={open ? false : undefined}><Button className="header-icon-button" type="text" aria-label={t('语言')} icon={<Languages size={17} />} /></Tooltip>
    </Dropdown>
  );
}

export function ColorModeButton() {
  const { mode, toggleMode, t } = usePreferences();
  const label = t(mode === 'dark' ? '切换为浅色模式' : '切换为暗黑模式');
  return <Tooltip title={label}><Button type="text" className="color-mode-button" aria-label={label} aria-pressed={mode === 'dark'} icon={mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />} onClick={toggleMode} /></Tooltip>;
}
