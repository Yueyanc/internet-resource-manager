import { StyleProvider } from '@ant-design/cssinjs';
import { App, ConfigProvider, theme, type ThemeConfig } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { type CSSProperties, type PropsWithChildren, useLayoutEffect } from 'react';

interface GlassPalette {
  canvas: string;
  canvasGlow: string;
  surface: string;
  surfaceSolid: string;
  surfaceElevated: string;
  glassBlur: string;
  glassBorder: string;
  glassHairline: string;
  glassSpecular: string;
  glassShadow: string;
  glassShadowHover: string;
  signal: string;
}

const lightGlass: GlassPalette = {
  canvas: '#f6f5f1',
  canvasGlow: [
    'radial-gradient(56% 48% at 18% 4%, rgba(253, 224, 166, 0.50) 0%, rgba(254, 236, 198, 0.22) 48%, transparent 78%)',
    'radial-gradient(48% 42% at 62% 6%, rgba(176, 236, 214, 0.36) 0%, rgba(206, 244, 229, 0.14) 48%, transparent 76%)',
    'radial-gradient(55% 48% at 10% 92%, rgba(238, 231, 218, 0.52) 0%, transparent 75%)',
  ].join(', '),
  surface: 'rgba(255, 255, 255, 0.72)',
  surfaceSolid: 'rgba(255, 255, 255, 0.90)',
  surfaceElevated: 'rgba(255, 255, 255, 0.92)',
  glassBlur: 'blur(22px) saturate(150%)',
  glassBorder: 'rgba(255, 255, 255, 0.88)',
  glassHairline: 'rgba(28, 25, 23, 0.065)',
  glassSpecular: 'rgba(255, 255, 255, 0.96)',
  glassShadow: '0 10px 28px -14px rgba(28, 25, 23, 0.08), 0 2px 6px -2px rgba(28, 25, 23, 0.03)',
  glassShadowHover: '0 16px 34px -14px rgba(28, 25, 23, 0.13), 0 4px 10px -3px rgba(28, 25, 23, 0.05)',
  signal: '#0d9488',
};

const darkGlass: GlassPalette = {
  canvas: '#0c0e12',
  canvasGlow: [
    'radial-gradient(52% 46% at 24% 6%, rgba(16, 185, 129, 0.25) 0%, rgba(13, 148, 136, 0.11) 46%, transparent 78%)',
    'radial-gradient(46% 40% at 54% 12%, rgba(14, 165, 233, 0.12) 0%, transparent 72%)',
    'radial-gradient(36% 34% at 4% 4%, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
  ].join(', '),
  surface: 'rgba(22, 26, 33, 0.62)',
  surfaceSolid: 'rgba(28, 33, 41, 0.84)',
  surfaceElevated: 'rgba(24, 29, 37, 0.90)',
  glassBlur: 'blur(22px) saturate(155%)',
  glassBorder: 'rgba(255, 255, 255, 0.11)',
  glassHairline: 'rgba(255, 255, 255, 0.06)',
  glassSpecular: 'rgba(255, 255, 255, 0.14)',
  glassShadow: '0 14px 34px -12px rgba(0, 0, 0, 0.58), 0 2px 8px -2px rgba(0, 0, 0, 0.38)',
  glassShadowHover: '0 20px 40px -12px rgba(0, 0, 0, 0.72), 0 4px 12px -2px rgba(0, 0, 0, 0.46)',
  signal: '#10b981',
};

function buildThemeConfig(mode: 'dark' | 'light'): ThemeConfig {
  const isDark = mode === 'dark';
  const glass = isDark ? darkGlass : lightGlass;
  const accent = isDark ? '#10b981' : '#18181b';
  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: accent,
      colorInfo: isDark ? '#14b8a6' : '#0d9488',
      colorLink: isDark ? '#34d399' : '#18181b',
      colorText: isDark ? '#f1f5f9' : '#18181b',
      colorTextSecondary: isDark ? '#94a3b8' : '#57534e',
      colorTextTertiary: isDark ? '#64748b' : '#8c857e',
      colorBgLayout: glass.canvas,
      colorBgContainer: glass.surface,
      colorBgElevated: glass.surfaceElevated,
      colorBorder: isDark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(28, 25, 23, 0.13)',
      colorBorderSecondary: glass.glassHairline,
      colorFillSecondary: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(28, 25, 23, 0.06)',
      colorFillTertiary: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(28, 25, 23, 0.045)',
      colorFillQuaternary: isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(28, 25, 23, 0.025)',
      colorPrimaryBg: isDark ? 'rgba(16, 185, 129, 0.14)' : 'rgba(24, 24, 27, 0.06)',
      colorPrimaryBgHover: isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(24, 24, 27, 0.10)',
      borderRadius: 10,
      borderRadiusLG: 16,
      borderRadiusSM: 7,
      boxShadow: glass.glassShadow,
      boxShadowSecondary: glass.glassShadowHover,
    },
    components: {
      Card: {
        borderRadiusLG: 16,
        headerBg: 'transparent',
      },
      Button: isDark
        ? {
            borderRadius: 10,
            controlHeight: 36,
            colorPrimary: '#1b2624',
            colorPrimaryHover: '#233330',
            colorPrimaryActive: '#141d1b',
            primaryColor: '#f1f5f9',
            defaultBg: glass.surfaceSolid,
            defaultBorderColor: 'rgba(255, 255, 255, 0.11)',
            primaryShadow: '0 8px 20px -6px rgba(0, 0, 0, 0.60)',
          }
        : {
            borderRadius: 10,
            controlHeight: 36,
            colorPrimary: '#18181b',
            colorPrimaryHover: '#27272a',
            colorPrimaryActive: '#09090b',
            primaryColor: '#ffffff',
            defaultBg: glass.surfaceSolid,
            defaultBorderColor: 'rgba(28, 25, 23, 0.11)',
            primaryShadow: '0 6px 16px -4px rgba(24, 24, 27, 0.28)',
          },
      Input: {
        colorBgContainer: isDark ? 'rgba(12, 14, 18, 0.50)' : 'rgba(255, 255, 255, 0.72)',
        activeShadow: isDark ? '0 0 0 3px rgba(16, 185, 129, 0.16)' : '0 0 0 3px rgba(24, 24, 27, 0.08)',
      },
      InputNumber: {
        colorBgContainer: isDark ? 'rgba(12, 14, 18, 0.50)' : 'rgba(255, 255, 255, 0.72)',
      },
      Select: {
        colorBgContainer: isDark ? 'rgba(12, 14, 18, 0.50)' : 'rgba(255, 255, 255, 0.72)',
        optionSelectedBg: isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(24, 24, 27, 0.07)',
      },
      DatePicker: {
        colorBgContainer: isDark ? 'rgba(12, 14, 18, 0.50)' : 'rgba(255, 255, 255, 0.72)',
      },
      Segmented: {
        trackBg: isDark ? 'rgba(12, 14, 18, 0.68)' : 'rgba(232, 228, 221, 0.70)',
        itemSelectedBg: isDark ? 'rgba(38, 44, 54, 0.94)' : 'rgba(255, 255, 255, 0.96)',
        trackPadding: 3,
        borderRadius: 10,
        borderRadiusSM: 8,
      },
      Menu: {
        itemBorderRadius: 10,
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        itemSelectedBg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.92)',
        itemSelectedColor: isDark ? '#f8fafc' : '#18181b',
        itemHoverBg: isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(28, 25, 23, 0.045)',
      },
      Table: {
        headerBg: isDark ? 'rgba(26, 31, 40, 0.68)' : 'rgba(245, 243, 238, 0.72)',
        rowHoverBg: isDark ? 'rgba(16, 185, 129, 0.055)' : 'rgba(28, 25, 23, 0.03)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(28, 25, 23, 0.07)',
        headerSplitColor: 'transparent',
      },
      Modal: {
        contentBg: glass.surfaceElevated,
        headerBg: 'transparent',
        footerBg: 'transparent',
        borderRadiusLG: 18,
      },
      Drawer: {
        colorBgElevated: glass.surfaceElevated,
      },
    },
  };
}

function ThemeSurface({ children, mode }: PropsWithChildren<{ mode: 'dark' | 'light' }>) {
  const { token } = theme.useToken();
  const glass = mode === 'dark' ? darkGlass : lightGlass;
  const vars: Record<string, string> = {
    '--canvas': glass.canvas,
    '--canvas-glow': glass.canvasGlow,
    '--surface': glass.surface,
    '--surface-solid': glass.surfaceSolid,
    '--surface-elevated': glass.surfaceElevated,
    '--surface-hover': token.colorFillTertiary,
    '--glass-blur': glass.glassBlur,
    '--glass-border': glass.glassBorder,
    '--glass-hairline': glass.glassHairline,
    '--glass-specular': glass.glassSpecular,
    '--glass-shadow': glass.glassShadow,
    '--glass-shadow-hover': glass.glassShadowHover,
    '--signal': glass.signal,
    '--text': token.colorText,
    '--muted': token.colorTextSecondary,
    '--quiet': token.colorTextTertiary,
    '--border': token.colorBorderSecondary,
    '--accent': token.colorPrimary,
    '--accent-soft': token.colorPrimaryBg,
    '--danger': token.colorError,
    '--warning': token.colorWarning,
    '--scrollbar-thumb': mode === 'dark' ? 'rgba(255, 255, 255, 0.22)' : 'rgba(28, 25, 23, 0.24)',
    '--scrollbar-thumb-hover': mode === 'dark' ? 'rgba(255, 255, 255, 0.38)' : 'rgba(28, 25, 23, 0.40)',
  };
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  });
  return <App style={vars as CSSProperties}>{children}</App>;
}

export function ThemeProvider({ children, mode = 'light', locale = 'zh-CN' }: PropsWithChildren<{ mode?: 'dark' | 'light'; locale?: 'zh-CN' | 'en-US' }>) {
  return (
    <StyleProvider layer>
      <ConfigProvider
        locale={locale === 'en-US' ? enUS : zhCN}
        button={{ autoInsertSpace: false }}
        theme={buildThemeConfig(mode)}
      >
        <ThemeSurface mode={mode}>{children}</ThemeSurface>
      </ConfigProvider>
    </StyleProvider>
  );
}
