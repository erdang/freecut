import { CURRENT_SCHEMA_VERSION } from '@/core/projects/migrations'
import type { Project } from '@/types/project'

function generateProjectId(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const array = new Uint8Array(8)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => chars[b % 62])
    .join('')
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  if (weeks < 4) return `${weeks} 周前`
  if (months < 12) return `${months} 个月前`
  return `${years} 年前`
}

export function filterProjects(projects: Project[], searchQuery: string): Project[] {
  if (!searchQuery.trim()) return projects

  const query = searchQuery.toLowerCase().trim()

  return projects.filter(
    (project) =>
      project.name.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query),
  )
}

export function filterByResolution(projects: Project[], resolution?: string): Project[] {
  if (!resolution) return projects

  return projects.filter((project) => {
    if (!project?.metadata?.width || !project?.metadata?.height) return false
    const projectResolution = `${project.metadata.width}x${project.metadata.height}`
    return projectResolution === resolution
  })
}

export function filterByFps(projects: Project[], fps?: number): Project[] {
  if (!fps) return projects

  return projects.filter((project) => project?.metadata?.fps === fps)
}

type SortField = 'name' | 'createdAt' | 'updatedAt' | 'resolution'
type SortDirection = 'asc' | 'desc'

export function sortProjects(
  projects: Project[],
  field: SortField,
  direction: SortDirection = 'desc',
): Project[] {
  const sorted = [...projects].sort((a, b) => {
    let comparison = 0

    switch (field) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
        break
      case 'createdAt':
        comparison = a.createdAt - b.createdAt
        break
      case 'updatedAt':
        comparison = a.updatedAt - b.updatedAt
        break
      case 'resolution': {
        const aRes = (a?.metadata?.width || 0) * (a?.metadata?.height || 0)
        const bRes = (b?.metadata?.width || 0) * (b?.metadata?.height || 0)
        comparison = aRes - bRes
        break
      }
    }

    return direction === 'asc' ? comparison : -comparison
  })

  return sorted
}

export function getUniqueResolutions(projects: Project[]): string[] {
  const resolutions = new Set(
    projects
      .filter((p) => p?.metadata?.width && p?.metadata?.height)
      .map((p) => `${p.metadata.width}x${p.metadata.height}`),
  )
  return Array.from(resolutions).sort()
}

export function getUniqueFps(projects: Project[]): number[] {
  const fpsSet = new Set(projects.filter((p) => p?.metadata?.fps).map((p) => p.metadata.fps))
  return Array.from(fpsSet).sort((a, b) => a - b)
}

export function createProjectObject(
  formData: {
    name: string
    description?: string
    width: number
    height: number
    fps: number
  },
  id?: string,
): Project {
  const now = Date.now()

  return {
    id: id || generateProjectId(),
    name: formData.name,
    description: formData.description || '',
    metadata: {
      width: formData.width,
      height: formData.height,
      fps: formData.fps,
    },
    createdAt: now,
    updatedAt: now,
    duration: 0,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    thumbnail: undefined,
  }
}

export function duplicateProject(project: Project): Project {
  const now = Date.now()

  return {
    ...project,
    id: generateProjectId(),
    name: `${project.name}（副本）`,
    createdAt: now,
    updatedAt: now,
  }
}

export function formatProjectUpgradeBackupName(
  projectName: string,
  fromVersion: number,
  toVersion: number,
): string {
  return `${projectName}（升级前备份 v${fromVersion} -> v${toVersion}）`
}

export function generateTemplateName(namePrefix: string, existingNames: string[]): string {
  const escapedPrefix = namePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escapedPrefix}\\s*\\((\\d+)\\)$`)

  let maxSuffix = 0
  for (const name of existingNames) {
    const match = name.match(pattern)
    if (match) {
      const suffix = parseInt(match[1]!, 10)
      maxSuffix = Math.max(maxSuffix, suffix)
    }
  }

  return `${namePrefix} (${maxSuffix + 1})`
}
