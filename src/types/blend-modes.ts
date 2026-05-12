/** Blend modes for layer compositing (GPU compositor) */
export type BlendMode =
  // Normal
  | 'normal'
  | 'dissolve'
  // Darken
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'linear-burn'
  // Lighten
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'linear-dodge'
  // Contrast
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'vivid-light'
  | 'linear-light'
  | 'pin-light'
  | 'hard-mix'
  // Inversion
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  // Component (HSL)
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

/** Map blend mode string to u32 index for GPU shader */
export const BLEND_MODE_INDEX: Record<BlendMode, number> = {
  normal: 0,
  dissolve: 1,
  darken: 2,
  multiply: 3,
  'color-burn': 4,
  'linear-burn': 5,
  lighten: 6,
  screen: 7,
  'color-dodge': 8,
  'linear-dodge': 9,
  overlay: 10,
  'soft-light': 11,
  'hard-light': 12,
  'vivid-light': 13,
  'linear-light': 14,
  'pin-light': 15,
  'hard-mix': 16,
  difference: 17,
  exclusion: 18,
  subtract: 19,
  divide: 20,
  hue: 21,
  saturation: 22,
  color: 23,
  luminosity: 24,
}

export const BLEND_MODE_LABELS: Record<BlendMode, string> = {
  normal: '正常',
  dissolve: '溶解',
  darken: '变暗',
  multiply: '正片叠底',
  'color-burn': '颜色加深',
  'linear-burn': '线性加深',
  lighten: '变亮',
  screen: '滤色',
  'color-dodge': '颜色减淡',
  'linear-dodge': '线性减淡（添加）',
  overlay: '叠加',
  'soft-light': '柔光',
  'hard-light': '强光',
  'vivid-light': '亮光',
  'linear-light': '线性光',
  'pin-light': '点光',
  'hard-mix': '实色混合',
  difference: '差值',
  exclusion: '排除',
  subtract: '减去',
  divide: '划分',
  hue: '色相',
  saturation: '饱和度',
  color: '颜色',
  luminosity: '明度',
}

/** Grouped blend modes for UI dropdown */
export const BLEND_MODE_GROUPS: { label: string; modes: BlendMode[] }[] = [
  { label: '正常', modes: ['normal', 'dissolve'] },
  { label: '变暗', modes: ['darken', 'multiply', 'color-burn', 'linear-burn'] },
  { label: '变亮', modes: ['lighten', 'screen', 'color-dodge', 'linear-dodge'] },
  {
    label: '对比',
    modes: [
      'overlay',
      'soft-light',
      'hard-light',
      'vivid-light',
      'linear-light',
      'pin-light',
      'hard-mix',
    ],
  },
  { label: '反相', modes: ['difference', 'exclusion', 'subtract', 'divide'] },
  { label: '分量', modes: ['hue', 'saturation', 'color', 'luminosity'] },
]
