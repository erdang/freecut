import { FolderOpen, FolderX, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FreeCutLogo } from '@/components/brand/freecut-logo';

type Status =
  | { kind: 'initializing' }
  | { kind: 'unavailable' }
  | { kind: 'pick' }
  | { kind: 'reconnect'; handleName: string };

interface Props {
  status: Status;
  onPickFolder: () => void;
  onReconnect: () => void;
}

export function WorkspaceGateSplash({ status, onPickFolder, onReconnect }: Props) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-lg w-full text-center">
        <FreeCutLogo variant="full" size="lg" className="justify-center mb-8" />

        {status.kind === 'initializing' && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在加载…
          </div>
        )}

        {status.kind === 'unavailable' && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-destructive">
              <FolderX className="h-5 w-5" />
              <span className="font-medium">浏览器不受支持</span>
            </div>
            <p className="text-sm text-muted-foreground">
              FreeCut 依赖 Chromium 内核浏览器（Chrome、Edge、Brave、Arc）
              提供工作区文件夹存储能力。Firefox 和 Safari 目前还不支持
              File System Access API。
            </p>
          </div>
        )}

        {status.kind === 'pick' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold mb-2">选择你的工作区文件夹</h1>
              <p className="text-sm text-muted-foreground">
                FreeCut 会把你的项目、媒体和缓存以普通文件的形式保存在你指定的文件夹里。
                请选择磁盘上的任意一个文件夹，后续项目都会存放在那里。
              </p>
            </div>
            <Button size="lg" className="gap-2" onClick={onPickFolder}>
              <FolderOpen className="h-4 w-4" />
              选择文件夹
            </Button>
            <p className="text-xs text-muted-foreground">
              提示：你也可以选择 Dropbox、iCloud 或 Google Drive 中的文件夹，
              以便在不同设备之间同步项目，之后也可以再迁移。
            </p>
          </div>
        )}

        {status.kind === 'reconnect' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold mb-2">重新连接工作区</h1>
              <p className="text-sm text-muted-foreground">
                需要重新获得对 <span className="font-mono">{status.handleName}</span> 的访问权限。
                这通常会发生在浏览器重新启动之后。
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="lg" className="gap-2" onClick={onPickFolder}>
                <FolderOpen className="h-4 w-4" />
                选择其他文件夹
              </Button>
              <Button size="lg" className="gap-2" onClick={onReconnect}>
                <RefreshCw className="h-4 w-4" />
                重新连接
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
