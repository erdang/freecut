import { z } from 'zod'
import { DEFAULT_PROJECT_FPS_OPTIONS, isAllowedProjectFps } from './project-fps'

export const projectFormSchema = z.object({
  name: z
    .string()
    .min(1, '项目名称不能为空')
    .max(100, '项目名称不能超过 100 个字符')
    .refine((name) => name.trim().length > 0, {
      message: '项目名称不能全为空格',
    }),

  description: z.string().max(500, '描述不能超过 500 个字符').optional().or(z.literal('')),

  width: z
    .number()
    .int('宽度必须是整数')
    .min(320, '宽度至少为 320px')
    .max(7680, '宽度最多为 7680px（8K）'),

  height: z
    .number()
    .int('高度必须是整数')
    .min(240, '高度至少为 240px')
    .max(4320, '高度最多为 4320px（8K）'),

  fps: z
    .number()
    .int('帧率必须是整数')
    .min(1, '帧率至少为 1')
    .max(240, '帧率最多为 240')
    .refine((fps) => isAllowedProjectFps(fps), {
      message: '帧率需为支持的预设值',
    }),

  backgroundColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, '颜色格式无效（例如：#000000）')
    .optional(),
})

export type ProjectFormData = z.infer<typeof projectFormSchema>

export interface ProjectTemplate {
  id: string
  platform: string
  name: string
  namePrefix: string
  width: number
  height: number
  fps: number
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: 'youtube-1080p',
    platform: 'YouTube',
    name: 'YouTube 1080p',
    namePrefix: 'YouTube',
    width: 1920,
    height: 1080,
    fps: 30,
  },
  {
    id: 'vertical-9-16',
    platform: '竖屏',
    name: 'Shorts / TikTok / Reels',
    namePrefix: 'Vertical',
    width: 1080,
    height: 1920,
    fps: 30,
  },
  {
    id: 'instagram-square',
    platform: 'Instagram',
    name: 'Instagram Square',
    namePrefix: 'Instagram Square',
    width: 1080,
    height: 1080,
    fps: 30,
  },
  {
    id: 'instagram-portrait',
    platform: 'Instagram',
    name: 'Instagram Portrait',
    namePrefix: 'Instagram Portrait',
    width: 1080,
    height: 1350,
    fps: 30,
  },
  {
    id: 'twitter-x',
    platform: 'Twitter/X',
    name: 'Twitter/X',
    namePrefix: 'Twitter/X',
    width: 1200,
    height: 675,
    fps: 30,
  },
  {
    id: 'linkedin',
    platform: 'LinkedIn',
    name: 'LinkedIn',
    namePrefix: 'LinkedIn',
    width: 1200,
    height: 627,
    fps: 30,
  },
] as const

export const RESOLUTION_PRESETS = [
  { label: '1280×720 (HD)', value: '1280x720', width: 1280, height: 720 },
  { label: '1920×1080 (Full HD)', value: '1920x1080', width: 1920, height: 1080 },
  { label: '2560×1440 (2K)', value: '2560x1440', width: 2560, height: 1440 },
  { label: '3840×2160 (4K)', value: '3840x2160', width: 3840, height: 2160 },
  { label: '1080×1920 (TikTok / Reels / Shorts)', value: '1080x1920', width: 1080, height: 1920 },
  { label: '720×1280 (Vertical 720p)', value: '720x1280', width: 720, height: 1280 },
  { label: '1080×1080 (Square)', value: '1080x1080', width: 1080, height: 1080 },
  { label: '1080×1350 (Instagram Portrait)', value: '1080x1350', width: 1080, height: 1350 },
  { label: '2560×1080 (Ultrawide)', value: '2560x1080', width: 2560, height: 1080 },
] as const

export const FPS_PRESETS = [...DEFAULT_PROJECT_FPS_OPTIONS]

export const DEFAULT_PROJECT_VALUES: ProjectFormData = {
  name: '',
  description: '',
  width: 1920,
  height: 1080,
  fps: 30,
}

export function getAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const divisor = gcd(width, height)

  const ratioWidth = width / divisor
  const ratioHeight = height / divisor

  if (ratioWidth === 16 && ratioHeight === 9) return '16:9'
  if (ratioWidth === 9 && ratioHeight === 16) return '9:16'
  if (ratioWidth === 4 && ratioHeight === 3) return '4:3'
  if (ratioWidth === 3 && ratioHeight === 4) return '3:4'
  if (ratioWidth === 21 && ratioHeight === 9) return '21:9'
  if (ratioWidth === 1 && ratioHeight === 1) return '1:1'
  if (ratioWidth === 2 && ratioHeight === 3) return '2:3'
  if (ratioWidth === 3 && ratioHeight === 2) return '3:2'
  if (ratioWidth === 4 && ratioHeight === 5) return '4:5'
  if (ratioWidth === 5 && ratioHeight === 4) return '5:4'

  return `${ratioWidth}:${ratioHeight}`
}
