import { describe, expect, it } from 'vite-plus/test'
import { HOTKEYS } from '@/config/hotkeys'
import {
  HOTKEY_EDITOR_SECTIONS,
  getHotkeyBindingDisplayLabel,
  getHotkeyEditorSearchResults,
} from './hotkey-editor-sections'

describe('getHotkeyEditorSearchResults', () => {
  it('filters commands by localized label', () => {
    const results = getHotkeyEditorSearchResults({
      query: '波纹',
      sections: HOTKEY_EDITOR_SECTIONS,
      hotkeys: HOTKEYS,
    })

    expect(results.map((result) => result.item.label)).toEqual(['波纹删除选中项'])
  })

  it('filters commands by current shortcut binding', () => {
    const results = getHotkeyEditorSearchResults({
      query: 'mod+shift+e',
      sections: HOTKEY_EDITOR_SECTIONS,
      hotkeys: HOTKEYS,
      translate: (key) => (key.endsWith('exportVideo') ? 'Export video' : key),
    })

    expect(results.map((result) => result.item.label)).toEqual(['导出视频'])
  })
})

describe('getHotkeyBindingDisplayLabel', () => {
  it('shows an explicit unassigned label for blank bindings', () => {
    expect(getHotkeyBindingDisplayLabel('', 'Unassigned')).toBe('Unassigned')
  })

  it('formats non-empty bindings normally', () => {
    expect(getHotkeyBindingDisplayLabel('mod+shift+e', 'Unassigned')).toBe('Ctrl + Shift + E')
  })
})
