import {
  formatHotkeyBinding,
  normalizeHotkeyBinding,
  type HotkeyBindingMap,
  type HotkeyKey,
} from '@/config/hotkeys'

export interface HotkeyEditorItem {
  label: string
  keys: readonly HotkeyKey[]
}

export interface HotkeyEditorSection {
  title: string
  blurb: string
  items: readonly HotkeyEditorItem[]
}

export interface HotkeyEditorSearchResult {
  section: HotkeyEditorSection
  item: HotkeyEditorItem
}

interface HotkeyEditorSearchOptions {
  query: string
  sections: readonly HotkeyEditorSection[]
  hotkeys: HotkeyBindingMap
  translate?: (label: string) => string
}

export function getHotkeyBindingDisplayLabel(binding: string, unassignedLabel: string): string {
  return binding ? formatHotkeyBinding(binding) : unassignedLabel
}

export function getHotkeyEditorSearchResults({
  query,
  sections,
  hotkeys,
  translate,
}: HotkeyEditorSearchOptions): HotkeyEditorSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return []
  }

  const normalizedBindingQuery = normalizeHotkeyBinding(normalizedQuery)
  const translateLabel = translate ?? ((label: string) => label)

  return sections.flatMap((section) => {
    const sectionLabel = translateLabel(section.title).toLowerCase()

    return section.items
      .filter((item) => {
        const itemLabel = translateLabel(item.label).toLowerCase()
        const bindings = item.keys.map((key) => hotkeys[key].toLowerCase())

        return (
          itemLabel.includes(normalizedQuery) ||
          sectionLabel.includes(normalizedQuery) ||
          item.keys.some((key) => key.toLowerCase().includes(normalizedQuery)) ||
          bindings.some(
            (binding) =>
              binding.includes(normalizedQuery) ||
              (normalizedBindingQuery.length > 0 && binding === normalizedBindingQuery),
          )
        )
      })
      .map((item) => ({ section, item }))
  })
}

export const HOTKEY_EDITOR_SECTIONS: readonly HotkeyEditorSection[] = [
  {
    title: '播放控制',
    blurb: '播放传输、逐帧步进与时间线跳转。',
    items: [
      { label: '播放/暂停', keys: ['PLAY_PAUSE'] },
      { label: '上一帧', keys: ['PREVIOUS_FRAME'] },
      { label: '下一帧', keys: ['NEXT_FRAME'] },
      { label: '跳到开头', keys: ['GO_TO_START'] },
      { label: '跳到结尾', keys: ['GO_TO_END'] },
      { label: '上一个吸附点', keys: ['PREVIOUS_SNAP_POINT'] },
      { label: '下一个吸附点', keys: ['NEXT_SNAP_POINT'] },
    ],
  },
  {
    title: '编辑',
    blurb: '片段编辑、删除流程与画布精细移动。',
    items: [
      { label: '在播放头处分割', keys: ['SPLIT_AT_PLAYHEAD', 'SPLIT_AT_PLAYHEAD_ALT'] },
      { label: '合并选中片段', keys: ['JOIN_ITEMS'] },
      { label: '删除选中项', keys: ['DELETE_SELECTED', 'DELETE_SELECTED_ALT'] },
      { label: '波纹删除选中项', keys: ['RIPPLE_DELETE', 'RIPPLE_DELETE_ALT'] },
      { label: '在播放头插入定格帧', keys: ['FREEZE_FRAME'] },
      { label: '链接选中片段', keys: ['LINK_AUDIO_VIDEO'] },
      { label: '取消链接选中片段', keys: ['UNLINK_AUDIO_VIDEO'] },
      { label: '切换联动选择', keys: ['TOGGLE_LINKED_SELECTION'] },
      { label: '微移（1px）', keys: ['NUDGE_LEFT', 'NUDGE_RIGHT', 'NUDGE_UP', 'NUDGE_DOWN'] },
      {
        label: '微移（10px）',
        keys: ['NUDGE_LEFT_LARGE', 'NUDGE_RIGHT_LARGE', 'NUDGE_UP_LARGE', 'NUDGE_DOWN_LARGE'],
      },
    ],
  },
  {
    title: '工具',
    blurb: '时间线编辑模式的工具切换。',
    items: [
      { label: '选择工具', keys: ['SELECTION_TOOL'] },
      { label: '修剪编辑工具', keys: ['TRIM_EDIT_TOOL'] },
      { label: '刀片工具', keys: ['RAZOR_TOOL'] },
      { label: '在光标处分割', keys: ['SPLIT_AT_CURSOR'] },
      { label: '速率拉伸工具', keys: ['RATE_STRETCH_TOOL'] },
      { label: '滑移工具', keys: ['SLIP_TOOL'] },
      { label: '滑动工具', keys: ['SLIDE_TOOL'] },
    ],
  },
  {
    title: '历史与界面',
    blurb: '时间线历史、缩放与界面开关。',
    items: [
      { label: '撤销', keys: ['UNDO'] },
      { label: '重做', keys: ['REDO'] },
      { label: '时间线放大', keys: ['ZOOM_IN'] },
      { label: '时间线缩小', keys: ['ZOOM_OUT'] },
      { label: '缩放适配全部内容', keys: ['ZOOM_TO_FIT'] },
      { label: '缩放到 100%', keys: ['ZOOM_TO_100', 'ZOOM_TO_100_ALT'] },
      { label: '切换吸附', keys: ['TOGGLE_SNAP'] },
      { label: '切换画布（Gizmo）吸附', keys: ['TOGGLE_CANVAS_SNAP'] },
      { label: '切换关键帧编辑器面板', keys: ['TOGGLE_KEYFRAME_EDITOR'] },
    ],
  },
  {
    title: '剪贴板',
    blurb: '编辑器内通用的复制、剪切、粘贴操作。',
    items: [
      { label: '复制选中项或关键帧', keys: ['COPY'] },
      { label: '剪切选中项或关键帧', keys: ['CUT'] },
      { label: '粘贴项或关键帧', keys: ['PASTE'] },
    ],
  },
  {
    title: '标记',
    blurb: '标记创建、删除与跳转。',
    items: [
      { label: '在播放头添加标记', keys: ['ADD_MARKER'] },
      { label: '删除选中标记', keys: ['REMOVE_MARKER'] },
      { label: '跳到上一个标记', keys: ['PREVIOUS_MARKER'] },
      { label: '跳到下一个标记', keys: ['NEXT_MARKER'] },
    ],
  },
  {
    title: '关键帧',
    blurb: '关键帧编辑器操作与视图切换。',
    items: [
      { label: '清除选中项全部关键帧', keys: ['CLEAR_KEYFRAMES'] },
      { label: '关键帧编辑器切换为曲线视图', keys: ['KEYFRAME_EDITOR_GRAPH'] },
      { label: '关键帧编辑器切换为摄影表视图', keys: ['KEYFRAME_EDITOR_DOPESHEET'] },
    ],
  },
  {
    title: '源监视器',
    blurb: '入点/出点与插入/覆盖编辑。',
    items: [
      { label: '标记入点', keys: ['MARK_IN'] },
      { label: '标记出点', keys: ['MARK_OUT'] },
      { label: '清除入点/出点', keys: ['CLEAR_IN_OUT'] },
      { label: '插入编辑', keys: ['INSERT_EDIT'] },
      { label: '覆盖编辑', keys: ['OVERWRITE_EDIT'] },
    ],
  },
  {
    title: '项目',
    blurb: '保存与导出流程。',
    items: [
      { label: '保存项目', keys: ['SAVE'] },
      { label: '导出视频', keys: ['EXPORT'] },
      { label: '打开场景浏览器（搜索 AI 字幕）', keys: ['OPEN_SCENE_BROWSER'] },
    ],
  },
] as const
