import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { createLogger } from '@/shared/logging/logger';

const logger = createLogger('ProjectsIndex');
import { Button } from '@/components/ui/button';
import { Plus, Upload, FolderOpen, File, Github } from 'lucide-react';
import { FreeCutLogo } from '@/components/brand/freecut-logo';
import { ProjectList } from '@/features/projects/components/project-list';
import { ProjectForm } from '@/features/projects/components/project-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useProjectStore } from '@/features/projects/stores/project-store';
import { useProjectActions } from '@/features/projects/hooks/use-project-actions';
import { useProjects, useProjectsLoading, useProjectsError } from '@/features/projects/hooks/use-project-selectors';
import { cleanupBlobUrls } from '@/features/media-library/utils/media-resolver';
import type { Project } from '@/types/project';
import type { ProjectFormData } from '@/features/projects/utils/validation';
import type { ImportProgress } from '@/features/project-bundle/types/bundle';
import { BUNDLE_EXTENSION } from '@/features/project-bundle/types/bundle';
import { LegacyMigrationBanner } from '@/features/projects/components/legacy-migration-banner';
import { LegacyMigrationErrors } from '@/features/projects/components/legacy-migration-errors';
import { TrashSection } from '@/features/projects/components/trash-section';
import { WorkspaceIndicator } from '@/features/workspace-gate';

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndex,
  // Clean up any media blob URLs when returning to projects page
  beforeLoad: async () => {
    cleanupBlobUrls();
    // Always reload projects from storage to get fresh data (thumbnails may have changed)
    const { loadProjects } = useProjectStore.getState();
    await loadProjects();
  },
});

function ProjectsIndex() {
  const navigate = useNavigate();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import state - two-step flow
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [projectNameFromFile, setProjectNameFromFile] = useState<string | null>(null);
  const [destinationDir, setDestinationDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [destinationName, setDestinationName] = useState<string | null>(null);
  const [useProjectsFolder, setUseProjectsFolder] = useState(true); // Create FreeCutProjects subfolder
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const PROJECTS_FOLDER_NAME = 'FreeCutProjects';

  // Extract project name from bundle filename
  // Handles both "myproject.freecut.zip" and browser-renamed "myproject.freecut (1).zip"
  const extractProjectName = (fileName: string): string => {
    // Remove .zip extension first
    let name = fileName.replace(/\.zip$/i, '');
    // Remove browser duplicate suffix like " (1)", " (2)", etc.
    name = name.replace(/\s*\(\d+\)$/, '');
    // Remove .freecut suffix
    name = name.replace(/\.freecut$/i, '');
    return name;
  };

  // Check if file is a valid bundle (handles browser-renamed files like "project.freecut (1).zip")
  const isValidBundleFile = (fileName: string): boolean => {
    // Match: anything.freecut.zip or anything.freecut (N).zip
    return /\.freecut(\s*\(\d+\))?\.zip$/i.test(fileName);
  };

  const isLoading = useProjectsLoading();
  const projects = useProjects();
  const error = useProjectsError();
  const { loadProjects, updateProject } = useProjectActions();

  // Only show the full-page spinner for the genuine initial load — mutations
  // (delete/duplicate/update) should never blank the populated list.
  const showInitialLoadingSpinner = isLoading && projects.length === 0;

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Handle import file selection
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Step 1: File selected - show destination selection dialog
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input for next selection
    event.target.value = '';

    // Validate file extension (handles browser-renamed files like "project.freecut (1).zip")
    if (!isValidBundleFile(file.name)) {
      setImportError(`请选择有效的 ${BUNDLE_EXTENSION} 文件`);
      setImportDialogOpen(true);
      return;
    }

    // Store file and extract project name, then show destination selection dialog
    setPendingImportFile(file);
    setProjectNameFromFile(extractProjectName(file.name));
    setDestinationDir(null);
    setDestinationName(null);
    setImportError(null);
    setImportProgress(null);
    setIsImporting(false);
    setImportDialogOpen(true);
  };

  // Step 2: User clicks to select destination folder (fresh user gesture!)
  const handleSelectDestination = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({
        id: 'freecut-import',
        mode: 'readwrite',
        startIn: 'documents',
      });
      setDestinationDir(dirHandle);
      setDestinationName(dirHandle.name);
      setImportError(null);
    } catch (err) {
      // User cancelled - ignore
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      // Handle "contains system files" or permission errors
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        setImportError(
          '不能直接选择系统目录。请先在选择器中点击“New Folder”创建文件夹，再选择它。'
        );
        return;
      }
      logger.error('Failed to select directory:', err);
      setImportError('选择目标文件夹失败，请换一个位置再试。');
    }
  };

  // Step 3: User clicks "Start Import" - begin actual import
  const handleStartImport = async () => {
    if (!pendingImportFile || !destinationDir) return;

    setIsImporting(true);
    setImportProgress({ percent: 0, stage: 'validating' });

    try {
      // If useProjectsFolder is enabled, create/get the FreeCutProjects subfolder first
      let finalDestination = destinationDir;
      if (useProjectsFolder) {
        try {
          finalDestination = await destinationDir.getDirectoryHandle(PROJECTS_FOLDER_NAME, { create: true });
        } catch (err) {
          logger.error('Failed to create FreeCutProjects folder:', err);
          throw new Error(`创建 ${PROJECTS_FOLDER_NAME} 文件夹失败，请尝试选择其他位置。`);
        }
      }

      const { importProjectBundle } = await import(
        '@/features/project-bundle/services/bundle-import-service'
      );

      const result = await importProjectBundle(
        pendingImportFile,
        finalDestination,
        {},
        (progress) => {
          setImportProgress(progress);
        }
      );

      // Reload projects list
      await loadProjects();

      // Close dialog and navigate to the imported project
      handleCloseImportDialog();
      navigate({ to: '/editor/$projectId', params: { projectId: result.project.id } });
    } catch (err) {
      logger.error('Import failed:', err);
      setImportError(err instanceof Error ? err.message : '导入失败');
      setImportProgress(null);
      setIsImporting(false);
    }
  };

  // Reset import dialog state
  const handleCloseImportDialog = () => {
    if (isImporting) return; // Don't close while importing
    setImportDialogOpen(false);
    setPendingImportFile(null);
    setProjectNameFromFile(null);
    setDestinationDir(null);
    setDestinationName(null);
    setImportError(null);
    setImportProgress(null);
    setIsImporting(false);
  };

  // Compute full destination path for display
  const getFullDestinationPath = (): string => {
    if (!destinationName) return '';
    const parts = [destinationName];
    if (useProjectsFolder) parts.push(PROJECTS_FOLDER_NAME);
    if (projectNameFromFile) parts.push(projectNameFromFile);
    return parts.join('/');
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
  };

  const handleEditSubmit = async (data: ProjectFormData) => {
    if (!editingProject) return;

    setIsSubmitting(true);
    try {
      await updateProject(editingProject.id, data);
      setEditingProject(null);
    } catch (error) {
      logger.error('Failed to update project:', error);
      toast.error('更新项目失败', { description: '请稍后再试' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="panel-header border-b border-border" data-no-marquee>
          <div className="max-w-[1920px] mx-auto px-6 py-5 flex items-center justify-between">
            <Link to="/">
              <FreeCutLogo variant="full" size="md" className="hover:opacity-80 transition-opacity" />
            </Link>
            <div className="flex items-center gap-3">
              <WorkspaceIndicator />
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                asChild
              >
                <a
                  href="https://github.com/walterlow/freecut"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-tooltip="前往 GitHub"
                  data-tooltip-side="left"
                >
                  <Github className="w-5 h-5" />
                </a>
              </Button>
              <Button variant="outline" size="lg" className="gap-2" onClick={handleImportClick}>
                <Upload className="w-4 h-4" />
                导入项目
              </Button>
              <Link to="/projects/new">
                <Button size="lg" className="gap-2">
                  <Plus className="w-4 h-4" />
                  新建项目
                </Button>
              </Link>
            </div>

            {/* Hidden file input for import */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="max-w-[1920px] mx-auto px-6 py-4">
            <div className="panel-bg border border-destructive/50 rounded-lg p-4 text-destructive">
              <p className="font-medium">加载项目失败</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Legacy IDB migration banner — appears only when old data is present and unmigrated */}
        <div className="max-w-[1920px] mx-auto px-6 pt-6 space-y-3">
          <LegacyMigrationBanner onMigrated={loadProjects} />
          {/* Retry banner — appears only when a previous migration left failed items behind */}
          <LegacyMigrationErrors onRetried={loadProjects} />
        </div>

        {/* Loading state */}
        {showInitialLoadingSpinner ? (
          <div className="max-w-[1920px] mx-auto px-6 py-16 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">正在加载项目...</p>
            </div>
          </div>
        ) : (
          /* Projects List */
          <div className="max-w-[1920px] mx-auto px-6 py-8">
            <ProjectList onEditProject={handleEditProject} />
            <TrashSection />
          </div>
        )}
      </div>

      {/* Edit Project Dialog */}
      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="max-w-[1200px] w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">编辑项目</DialogTitle>
            <DialogDescription>更新项目设置</DialogDescription>
          </DialogHeader>
          {editingProject && (
            <ProjectForm
              onSubmit={handleEditSubmit}
              onCancel={() => setEditingProject(null)}
              defaultValues={{
                name: editingProject.name,
                description: editingProject.description,
                width: editingProject.metadata.width,
                height: editingProject.metadata.height,
                fps: editingProject.metadata.fps,
              }}
              isEditing={true}
              isSubmitting={isSubmitting}
              hideHeader
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Import Project Dialog - Two Step Flow */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        if (!open) handleCloseImportDialog();
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {importError ? '导入失败' : isImporting ? '正在导入项目' : '导入项目'}
            </DialogTitle>
            {!importError && !isImporting && pendingImportFile && (
              <DialogDescription>
                选择媒体文件解压保存的位置
              </DialogDescription>
            )}
            {!importError && isImporting && importProgress && (
              <DialogDescription>
                {importProgress.stage === 'validating' && '正在校验项目包...'}
                {importProgress.stage === 'extracting' && `正在解压${importProgress.currentFile ? `：${importProgress.currentFile}` : '...'}`}
                {importProgress.stage === 'importing_media' && `正在导入媒体${importProgress.currentFile ? `：${importProgress.currentFile}` : '...'}`}
                {importProgress.stage === 'linking' && '正在创建项目...'}
                {importProgress.stage === 'complete' && '导入完成！'}
              </DialogDescription>
            )}
          </DialogHeader>

          {importError && !pendingImportFile ? (
            /* Fatal error state - no file */
            <div className="space-y-4">
              <p className="text-sm text-destructive">{importError}</p>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleCloseImportDialog}
              >
                关闭
              </Button>
            </div>
          ) : isImporting && importProgress ? (
            /* Importing state - show progress */
            <div className="space-y-4">
              <Progress value={importProgress.percent} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                {Math.round(importProgress.percent)}%
              </p>
            </div>
          ) : pendingImportFile ? (
            /* Destination selection state */
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <File className="w-8 h-8 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{pendingImportFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(pendingImportFile.size)}</p>
                </div>
              </div>

              {/* Destination selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">目标文件夹</p>
                  {!destinationDir && (
                    <p className="text-xs text-muted-foreground">如有需要，请在选择器里使用 “New Folder”</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={handleSelectDestination}
                >
                  <FolderOpen className="w-4 h-4" />
                  {destinationName ? (
                    <span className="truncate">{destinationName}</span>
                  ) : (
                    <span className="text-muted-foreground">选择或创建文件夹...</span>
                  )}
                </Button>

                {/* FreeCutProjects subfolder option */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useProjectsFolder}
                    onChange={(e) => setUseProjectsFolder(e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm">
                    在 <code className="text-xs bg-muted px-1 py-0.5 rounded">{PROJECTS_FOLDER_NAME}</code> 子目录中创建
                  </span>
                </label>

                {importError && (
                  <p className="text-xs text-destructive">{importError}</p>
                )}
                {destinationDir && !importError && (
                  <div className="p-3 bg-muted/50 rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-1">媒体文件将保存到：</p>
                    <p className="text-sm font-semibold text-foreground break-all">
                      {getFullDestinationPath()}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={handleCloseImportDialog}>
                  取消
                </Button>
                <Button
                  onClick={handleStartImport}
                  disabled={!destinationDir}
                >
                  开始导入
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
