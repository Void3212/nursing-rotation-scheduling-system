import type { Assignment, RotationCategory } from '@/lib/scheduler'

export type SavedSchedule = {
  id: string
  name: string
  createdAt: string
  groupCount: number
  weekCount: number
  allowSpecialRepeats: boolean
  categories: RotationCategory[]
  assignments: Assignment[]
  validationErrors: string[]
  preferred?: boolean
}

const storageKey = 'clinica.rotation-schedules.v1'

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY))
}

export function readLocalSchedules(): SavedSchedule[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(value) ? value as SavedSchedule[] : []
  } catch {
    return []
  }
}

export function writeLocalSchedules(schedules: SavedSchedule[]) {
  localStorage.setItem(storageKey, JSON.stringify(schedules))
}