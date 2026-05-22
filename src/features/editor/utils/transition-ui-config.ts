/**
 * Shared transition UI configuration.
 * Single source of truth for transition presentation configs,
 * icons, and category metadata — derived from the transition registry.
 */

import {
  Blend,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Asterisk,
  Columns2,
  MoveRight,
  MoveLeft,
  MoveUp,
  MoveDown,
  FlipHorizontal,
  FlipVertical,
  Clock,
  Circle,
  Diamond,
  Eye,
  Hexagon,
  Heart,
  Pentagon,
  Plus,
  RectangleHorizontal,
  RotateCw,
  Rows3,
  Rows4,
  Square,
  Sparkles,
  Star,
  Triangle,
  Zap,
  Sun,
  Waves,
  ScanSearch,
  SplitSquareVertical,
  PanelTopOpen,
  X,
  Flame,
  Film,
  Droplet,
  Layers,
  Aperture,
  CircleDot,
  type LucideIcon,
} from 'lucide-react'
import { transitionRegistry } from '@/shared/timeline/transitions'
import type { PresentationConfig, TransitionCategory } from '@/types/transition'

/** Lucide icon lookup by name string */
export const TRANSITION_ICON_MAP: Record<string, LucideIcon> = {
  Blend,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Asterisk,
  Columns2,
  MoveRight,
  MoveLeft,
  MoveDown,
  MoveUp,
  FlipHorizontal,
  FlipHorizontal2: FlipHorizontal,
  FlipVertical,
  FlipVertical2: FlipVertical,
  Clock,
  Circle,
  Diamond,
  Eye,
  Hexagon,
  Heart,
  Pentagon,
  Plus,
  RectangleHorizontal,
  RotateCw,
  Rows3,
  Rows4,
  Square,
  Sparkles,
  Star,
  Triangle,
  Zap,
  Sun,
  Waves,
  ScanSearch,
  SplitSquareVertical,
  PanelTopOpen,
  X,
  Flame,
  Film,
  Droplet,
  Layers,
  Aperture,
  CircleDot,
}

/** Display labels for transition categories */
export const TRANSITION_CATEGORY_INFO: Record<string, { title: string }> = {
  basic: { title: '基础' },
  dissolve: { title: '溶解' },
  motion: { title: '运动' },
  wipe: { title: '擦除' },
  slide: { title: '滑动' },
  flip: { title: '翻转' },
  mask: { title: '遮罩' },
  iris: { title: '光圈' },
  shape: { title: '形状' },
  light: { title: '光效' },
  chromatic: { title: '色差' },
  custom: { title: '自定义' },
}

const TRANSITION_TEXT_ZH: Record<string, { label: string; description: string }> = {
  fade: { label: '淡入淡出', description: '片段之间通过黑场平滑过渡' },
  wipe: { label: '滑动擦除', description: '从指定方向滑动揭示新片段' },
  slide: { label: '推拉', description: '从指定方向推入新片段' },
  barnDoor: { label: '开门', description: '双门向两侧打开的转场' },
  split: { label: '分裂', description: '四分裂揭示新片段' },
  bandWipe: { label: '条带擦除', description: '交错条带擦除效果' },
  centerWipe: { label: '中心擦除', description: '从中心向两侧展开' },
  edgeWipe: { label: '边缘擦除', description: '从单侧边缘擦除' },
  radialWipe: { label: '径向擦除', description: '扇形径向擦除效果' },
  spiralWipe: { label: '螺旋擦除', description: '螺旋形旋转擦除效果' },
  venetianBlindWipe: { label: '百叶窗擦除', description: '横向百叶窗式擦除' },
  xWipe: { label: 'X 擦除', description: 'X 形擦除效果' },
  clockWipe: { label: '时钟擦除', description: '像时钟指针一样的圆形擦除' },
  iris: { label: '圆形光圈', description: '圆形光圈扩张/收缩转场' },
  arrowIris: { label: '箭头光圈', description: '箭头形光圈揭示效果' },
  crossIris: { label: '十字光圈', description: '十字形光圈揭示效果' },
  diamondIris: { label: '菱形光圈', description: '菱形光圈揭示效果' },
  eyeIris: { label: '眼形光圈', description: '眼形光圈揭示效果' },
  hexagonIris: { label: '六边形光圈', description: '六边形光圈揭示效果' },
  ovalIris: { label: '椭圆光圈', description: '椭圆光圈揭示效果' },
  pentagonIris: { label: '五边形光圈', description: '五边形光圈揭示效果' },
  squareIris: { label: '方形光圈', description: '方形光圈揭示效果' },
  triangleIris: { label: '三角光圈', description: '三角形光圈揭示效果' },
  boxShape: { label: '方框形状', description: '方框形状揭示效果' },
  heartShape: { label: '心形形状', description: '心形揭示效果' },
  starShape: { label: '星形形状', description: '星形揭示效果' },
  triangleLeftShape: { label: '左三角形', description: '向左三角揭示效果' },
  triangleRightShape: { label: '右三角形', description: '向右三角揭示效果' },
  flip: { label: '翻页翻转', description: '3D 翻转转场效果' },
  dissolve: { label: '交叉溶解', description: '片段间平滑透明度混合' },
  additiveDissolve: { label: '叠加溶解', description: '高亮区域更明显的溶解效果' },
  blurDissolve: { label: '模糊溶解', description: '中段带柔和模糊的溶解' },
  dipToColorDissolve: { label: '经颜色溶解', description: '先过渡到纯色再显现新片段' },
  nonAdditiveDissolve: { label: '非叠加溶解', description: '避免高亮叠加的中性溶解' },
  smoothCut: { label: '平滑切换', description: '适合跳剪的柔和液态过渡' },
  sparkles: { label: '星光闪烁', description: '闪烁星点揭示下一个片段' },
  glitch: { label: '故障闪断', description: '数字故障风格切换' },
  pixelate: { label: '像素化', description: '马赛克像素化过渡' },
  chromatic: { label: '色差偏移', description: 'RGB 色道分离并扫过画面' },
  radialBlur: { label: '径向模糊', description: '缩放与旋转模糊效果' },
  liquidDistort: { label: '液态扭曲', description: '带湍流边缘的液态扭曲过渡' },
  lensWarpZoom: { label: '镜头畸变变焦', description: '镜头畸变与变焦结合的转场' },
  lightLeakBurn: { label: '漏光灼烧', description: '暖色漏光与过曝灼烧效果' },
  filmGateSlip: { label: '胶片门抖动', description: '胶片门抖动与曝光闪烁效果' },
}

/** Ordered list of categories for UI rendering */
export const TRANSITION_CATEGORY_ORDER: TransitionCategory[] = [
  'basic',
  'dissolve',
  'motion',
  'wipe',
  'mask',
  'iris',
  'shape',
  'custom',
]

/** Direction string â†’ display label + icon name */
function createConfigsForDefinition(
  def: ReturnType<typeof transitionRegistry.getDefinitions>[number],
): PresentationConfig[] {
  const localized = TRANSITION_TEXT_ZH[def.id]
  return [
    {
      id: def.id,
      label: localized?.label ?? def.label,
      description: localized?.description ?? def.description,
      icon: def.icon,
      category: def.category,
      directions: def.hasDirection ? def.directions : undefined,
      defaultDirection: def.hasDirection ? def.directions?.[0] : undefined,
    },
  ]
}

/**
 * Generate PresentationConfig array from the transition registry.
 * Directional transitions produce one config and expose direction as a property.
 * The flat list is grouped in the same category order used by picker UIs so
 * category-based index math stays stable.
 */
function generateConfigsFromRegistry(): PresentationConfig[] {
  const groupedConfigs = new Map<string, PresentationConfig[]>()
  const uncategorizedConfigs: PresentationConfig[] = []
  const categoryOrder = new Set<string>(TRANSITION_CATEGORY_ORDER)

  for (const def of transitionRegistry.getDefinitions()) {
    const configs = createConfigsForDefinition(def)
    if (!categoryOrder.has(def.category)) {
      uncategorizedConfigs.push(...configs)
      continue
    }

    const existing = groupedConfigs.get(def.category) ?? []
    existing.push(...configs)
    groupedConfigs.set(def.category, existing)
  }

  return [
    ...TRANSITION_CATEGORY_ORDER.flatMap((category) => groupedConfigs.get(category) ?? []),
    ...uncategorizedConfigs,
  ]
}

// Lazy-initialized caches — avoids TDZ when bundler orders this module
// before the transition registry is populated (see CLAUDE.md gotchas).
let _presentationConfigs: PresentationConfig[] | null = null
let _configsByCategory: Record<string, PresentationConfig[]> | null = null
let _categoryStartIndices: Record<string, number> | null = null

function ensureInitialized(): void {
  if (_presentationConfigs) return

  _presentationConfigs = generateConfigsFromRegistry()
  _configsByCategory = {}
  _categoryStartIndices = {}

  for (const config of _presentationConfigs) {
    if (!_configsByCategory[config.category]) {
      _configsByCategory[config.category] = []
    }
    _configsByCategory[config.category]!.push(config)
  }

  let running = 0
  for (const category of TRANSITION_CATEGORY_ORDER) {
    _categoryStartIndices[category] = running
    running += _configsByCategory[category]?.length || 0
  }
}

/** All presentation configs, generated once from the registry */
export function getTransitionPresentationConfigs(): PresentationConfig[] {
  ensureInitialized()
  return _presentationConfigs!
}

/** Configs grouped by category (for picker UIs) */
export function getTransitionConfigsByCategory(): Record<string, PresentationConfig[]> {
  ensureInitialized()
  return _configsByCategory!
}

/** Start indices per category (for flat-list indexing) */
export function getTransitionCategoryStartIndices(): Record<string, number> {
  ensureInitialized()
  return _categoryStartIndices!
}
