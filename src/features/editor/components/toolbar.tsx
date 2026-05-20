import { memo, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FolderArchive,
  Keyboard,
  Save,
  Settings,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { LocalInferenceStatusPill } from './local-inference-status-pill'
import { SettingsDialog } from './settings-dialog'
import { ShortcutsDialog } from './shortcuts-dialog'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'
import { EDITOR_LAYOUT_CSS_VALUES } from '@/app/editor-layout'

const SAVE_ANIMATION_MIN_MS = 1800

interface ToolbarProps {
  projectId: string
  project: {
    id: string
    name: string
    width: number
    height: number
    fps: number
  }
  isDirty?: boolean
  onSave?: () => Promise<void>
  onExport?: () => void
  onExportBundle?: () => void
}

export const Toolbar = memo(function Toolbar({
  projectId,
  project,
  isDirty = false,
  onSave,
  onExport,
  onExportBundle,
}: ToolbarProps) {
  void projectId

  const navigate = useNavigate()
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [isSaveAnimating, setIsSaveAnimating] = useState(false)
  const [saveAnimationKey, setSaveAnimationKey] = useState(0)
  const saveAnimationTimeoutRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (saveAnimationTimeoutRef.current !== undefined) {
        window.clearTimeout(saveAnimationTimeoutRef.current)
      }
    }
  }, [])

  const handleBackClick = () => {
    if (isDirty) {
      setShowUnsavedDialog(true)
    } else {
      navigate({ to: '/projects' })
    }
  }

  const handleSave = async () => {
    const startedAt = performance.now()
    const finishSaveAnimation = () => {
      const remainingMs = Math.max(0, SAVE_ANIMATION_MIN_MS - (performance.now() - startedAt))

      saveAnimationTimeoutRef.current = window.setTimeout(() => {
        setIsSaveAnimating(false)
        saveAnimationTimeoutRef.current = undefined
      }, remainingMs)
    }

    if (saveAnimationTimeoutRef.current !== undefined) {
      window.clearTimeout(saveAnimationTimeoutRef.current)
    }

    setSaveAnimationKey((key) => key + 1)
    setIsSaveAnimating(true)

    if (onSave) {
      try {
        await onSave()
      } finally {
        finishSaveAnimation()
      }
    } else {
      finishSaveAnimation()
    }
  }

  return (
    <div
      className="panel-header flex flex-shrink-0 items-center gap-2.5 border-b border-border px-3"
      style={{ height: EDITOR_LAYOUT_CSS_VALUES.toolbarHeight }}
      role="toolbar"
      aria-label="编辑器工具栏"
    >
      <div className="flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleBackClick}
          data-tooltip="返回项目列表"
          data-tooltip-side="right"
          aria-label="返回项目列表"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <UnsavedChangesDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onSave={handleSave}
          projectName={project?.name}
        />

        <Separator orientation="vertical" className="h-5" />

        <div className="flex flex-col -space-y-0.5">
          <h1 className="text-sm font-medium leading-none">{project?.name || '未命名项目'}</h1>
          <span className="font-mono text-[11px] text-muted-foreground">
            {project?.width}x{project?.height} | {project?.fps}fps
          </span>
        </div>
      </div>

      <div className="flex-1" />

      <LocalInferenceStatusPill />

      <ShortcutsDialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog} />

      <SettingsDialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog} />

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setShowSettingsDialog(true)}
          data-tooltip="设置"
          data-tooltip-side="bottom"
          aria-label="设置"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setShowShortcutsDialog(true)}
          data-tooltip="快捷键"
          data-tooltip-side="bottom"
          aria-label="快捷键"
        >
          <Keyboard className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleSave}
          aria-label="保存项目"
        >
          <div className="relative">
            {isSaveAnimating ? (
              <SaveAnimationIcon key={saveAnimationKey} className="h-5 w-5" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isDirty && (
              <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-orange-500" />
            )}
          </div>
          保存
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5 glow-primary-sm">
              <Download className="h-4 w-4" />
              导出
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onExport} className="gap-2">
              <Video className="h-4 w-4" />
              导出视频
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportBundle} className="gap-2">
              <FolderArchive className="h-4 w-4" />
              下载项目（.zip）
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
})

function SaveAnimationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      version="1.1"
      id="L6"
      xmlns="http://www.w3.org/2000/svg"
      x="0px"
      y="0px"
      viewBox="12 12 76 76"
      enableBackground="new 12 12 76 76"
      xmlSpace="preserve"
      aria-hidden="true"
    >
      <rect fill="none" stroke="currentColor" strokeWidth="4" x="25" y="25" width="50" height="50">
        <animateTransform
          attributeName="transform"
          dur="0.5s"
          from="0 50 50"
          to="180 50 50"
          type="rotate"
          id="strokeBox"
          attributeType="XML"
          begin="rectBox.end"
        />
      </rect>
      <rect x="27" y="27" fill="currentColor" width="46" height="50">
        <animate
          attributeName="height"
          dur="1.3s"
          attributeType="XML"
          from="50"
          to="0"
          id="rectBox"
          fill="freeze"
          begin="0s;strokeBox.end"
        />
      </rect>
    </svg>
  )
}
