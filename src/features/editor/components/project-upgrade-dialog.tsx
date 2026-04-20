import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, HardDrive, RefreshCw } from 'lucide-react';

interface ProjectUpgradeDialogProps {
  backupName: string;
  currentSchemaVersion: number;
  isUpgrading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  projectName: string;
  storedSchemaVersion: number;
}

export function ProjectUpgradeDialog({
  backupName,
  currentSchemaVersion,
  isUpgrading,
  onCancel,
  onConfirm,
  open,
  projectName,
  storedSchemaVersion,
}: ProjectUpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && !isUpgrading) {
        onCancel();
      }
    }}>
      <DialogContent
        className="max-w-lg"
        hideCloseButton
        onEscapeKeyDown={(event) => {
          if (isUpgrading) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            打开前需要升级项目
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-1">
            <span className="block">
              <strong>{projectName}</strong> 使用项目结构版本 v{storedSchemaVersion} 保存，
              而当前版本需要 v{currentSchemaVersion}。
            </span>
            <span className="block">
              FreeCut 可以在加载编辑器前自动帮你升级。升级前会先创建一份备份，
              如果升级后发现异常，你仍然可以恢复旧数据。
            </span>
            <span className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              备份副本：<strong>{backupName}</strong>
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isUpgrading}
          >
            取消
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isUpgrading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isUpgrading ? 'animate-spin' : ''}`} />
            {isUpgrading ? '正在创建备份...' : '创建备份并升级'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
