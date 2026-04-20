import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Link } from '@tanstack/react-router';
import {
  projectFormSchema,
  type ProjectFormData,
  type ProjectTemplate,
  DEFAULT_PROJECT_VALUES,
  PROJECT_TEMPLATES,
} from '../utils/validation';
import { getProjectFpsOptions } from '../utils/project-fps';
import { ProjectTemplatePicker } from './project-template-picker';

interface ProjectFormProps {
  onSubmit: (data: ProjectFormData) => Promise<void> | void;
  onCancel?: () => void;
  defaultValues?: Partial<ProjectFormData>;
  isEditing?: boolean;
  isSubmitting?: boolean;
  hideHeader?: boolean;
}

export function ProjectForm({
  onSubmit,
  onCancel,
  defaultValues,
  isEditing = false,
  isSubmitting = false,
  hideHeader = false,
}: ProjectFormProps) {
  const resolvedDefaultValues = useMemo(
    () => ({
      ...DEFAULT_PROJECT_VALUES,
      ...defaultValues,
    }),
    [defaultValues]
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    setValue,
    reset,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: resolvedDefaultValues,
    mode: 'onChange',
  });

  const matchTemplateId = (width: number, height: number) =>
    PROJECT_TEMPLATES.find((t) => t.width === width && t.height === height)?.id ?? 'custom';

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(() =>
    matchTemplateId(
      resolvedDefaultValues.width,
      resolvedDefaultValues.height
    )
  );

  useEffect(() => {
    reset(resolvedDefaultValues);
  }, [reset, resolvedDefaultValues]);

  useEffect(() => {
    setSelectedTemplateId(
      matchTemplateId(
        resolvedDefaultValues.width,
        resolvedDefaultValues.height
      )
    );
  }, [resolvedDefaultValues.height, resolvedDefaultValues.width]);

  const fps = watch('fps');
  const fpsOptions = useMemo(() => getProjectFpsOptions(fps), [fps]);

  const handleSelectTemplate = (template: ProjectTemplate) => {
    setSelectedTemplateId(template.id);
    setValue('width', template.width, { shouldValidate: true });
    setValue('height', template.height, { shouldValidate: true });
    setValue('fps', template.fps, { shouldValidate: true });
  };

  const handleCustomSelect = () => {
    setSelectedTemplateId('custom');
  };

  return (
    <div className="bg-background">
      {/* Header */}
      {!hideHeader && (
        <div className="panel-header border-b border-border">
          <div className="max-w-[1400px] mx-auto px-6 py-5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">
              {isEditing ? '编辑项目' : '创建新项目'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isEditing
                ? '更新项目设置'
                : '配置你的视频编辑工作区'}
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <div className={hideHeader ? '' : 'max-w-[1400px] mx-auto px-6 py-8'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr] gap-6 items-start">
            {/* Project Details */}
            <div className={`panel-bg border border-border rounded-lg p-6 ${hideHeader ? '' : 'lg:sticky lg:top-6'}`}>
              <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-1 bg-primary rounded-full" />
                <h2 className="text-lg font-medium text-foreground">项目信息</h2>
              </div>

              <div className="space-y-5">
                {/* Project Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                    项目名称 <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    {...register('name')}
                    className="w-full px-3 py-2 bg-secondary border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                    placeholder="输入项目名称..."
                  />
                  {errors.name && (
                    <p className="mt-1.5 text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    项目描述
                  </label>
                  <textarea
                    id="description"
                    rows={4}
                    {...register('description')}
                    className="w-full px-3 py-2 bg-secondary border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all resize-none"
                    placeholder="简单描述一下你的项目..."
                  />
                  {errors.description && (
                    <p className="mt-1.5 text-sm text-destructive">{errors.description.message}</p>
                  )}
                </div>

                {/* Frame Rate */}
                <div>
                  <label htmlFor="fps" className="block text-sm font-medium text-foreground mb-2">
                    帧率
                  </label>
                  <Select
                    value={fps.toString()}
                    onValueChange={(value) => setValue('fps', Number(value), { shouldValidate: true })}
                  >
                    <SelectTrigger id="fps">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fpsOptions.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value.toString()}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.fps && (
                    <p className="mt-1.5 text-sm text-destructive">{errors.fps.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Video Settings */}
            <div className="panel-bg border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-1 bg-primary rounded-full" />
                <h2 className="text-lg font-medium text-foreground">分辨率</h2>
              </div>

              <ProjectTemplatePicker
                selectedTemplateId={selectedTemplateId === 'custom' ? undefined : selectedTemplateId}
                onSelectTemplate={handleSelectTemplate}
                onSelectCustom={handleCustomSelect}
                isCustomSelected={selectedTemplateId === 'custom'}
              />
              {selectedTemplateId === 'custom' && (
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex-1">
                    <label htmlFor="width" className="block text-xs font-medium text-muted-foreground mb-1">宽度（px）</label>
                    <input
                      id="width"
                      type="number"
                      {...register('width', { valueAsNumber: true })}
                      className="w-full px-3 py-2 bg-secondary border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                      placeholder="1920"
                      min={320}
                    />
                    {errors.width && <p className="mt-1 text-xs text-destructive">{errors.width.message}</p>}
                  </div>
                  <span className="text-muted-foreground mt-4">×</span>
                  <div className="flex-1">
                    <label htmlFor="height" className="block text-xs font-medium text-muted-foreground mb-1">高度（px）</label>
                    <input
                      id="height"
                      type="number"
                      {...register('height', { valueAsNumber: true })}
                      className="w-full px-3 py-2 bg-secondary border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                      placeholder="1080"
                      min={240}
                    />
                    {errors.height && <p className="mt-1 text-xs text-destructive">{errors.height.message}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            {onCancel ? (
              <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={onCancel}>
                取消
              </Button>
            ) : (
              <Link to="/projects">
                <Button type="button" variant="outline" size="lg" disabled={isSubmitting}>
                  取消
                </Button>
              </Link>
            )}
            <Button type="submit" size="lg" className="min-w-[160px]" disabled={!isValid || isSubmitting}>
              {isSubmitting ? '保存中...' : isEditing ? '更新项目' : '创建项目'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
