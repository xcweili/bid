/**
 * 投标评审平台 - 设计系统
 * 
 * 颜色方案：
 * - 主色：蓝色 (#1890ff) - 专业、信任
 * - 成功色：绿色 (#52c41a)
 * - 警告色：橙色 (#faad14)
 * - 错误色：红色 (#ff4d4f)
 * 
 * 间距尺度：4px 基准
 * - xs: 8px
 * - sm: 12px
 * - md: 16px
 * - lg: 24px
 * - xl: 32px
 * - xxl: 48px
 */

// 颜色变量
export const colors = {
  // 主色
  primary: '#1890ff',
  primaryHover: '#40a9ff',
  primaryActive: '#096dd9',
  
  // 功能色
  success: '#52c41a',
  warning: '#faad14',
  error: '#ff4d4f',
  info: '#1890ff',
  
  // 中性色
  textPrimary: 'rgba(0, 0, 0, 0.88)',
  textSecondary: 'rgba(0, 0, 0, 0.65)',
  textTertiary: 'rgba(0, 0, 0, 0.45)',
  textDisabled: 'rgba(0, 0, 0, 0.25)',
  
  border: '#d9d9d9',
  borderLight: '#f0f0f0',
  
  background: '#f5f5f5',
  backgroundCard: '#ffffff',
  backgroundHeader: '#ffffff',
  
  // 状态背景
  successBg: '#f6ffed',
  warningBg: '#fffbe6',
  errorBg: '#fff2f0',
  infoBg: '#e6f7ff',
} as const;

// 间距
export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// 字体
export const typography = {
  fontSizeSM: 12,
  fontSize: 14,
  fontSizeLG: 16,
  fontSizeXL: 20,
  fontSizeXXL: 24,
  
  fontWeightNormal: 400,
  fontWeightMedium: 500,
  fontWeightStrong: 600,
  
  lineHeight: 1.5715,
} as const;

// 圆角
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

// 阴影
export const shadows = {
  sm: '0 2px 4px rgba(0, 0, 0, 0.06)',
  md: '0 4px 12px rgba(0, 0, 0, 0.08)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
  xl: '0 12px 48px rgba(0, 0, 0, 0.15)',
} as const;

// 动画
export const transitions = {
  fast: '0.15s ease',
  normal: '0.3s ease',
  slow: '0.5s ease',
} as const;
