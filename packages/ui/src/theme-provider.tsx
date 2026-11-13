import { StyleProvider } from '@ant-design/cssinjs';
import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { PropsWithChildren } from 'react';

export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <StyleProvider layer>
      <ConfigProvider
        locale={zhCN}
        button={{ autoInsertSpace: false }}
        theme={{
          token: {
            colorPrimary: '#16815d',
            colorInfo: '#16815d',
            borderRadius: 6,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            controlHeight: 36,
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </StyleProvider>
  );
}
