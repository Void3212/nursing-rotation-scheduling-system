export type RotationArea = { name: string; capacity: number }
export type RotationCategory = { name: string; areas: RotationArea[] }
export type Assignment = { group: string; category: string; area: string; week: number; shift: string }

export const defaultCategories: RotationCategory[] = [
  { name: 'OR DIDACTICS', areas: [{ name: 'OR DIDACTICS', capacity: 1 }] },
  { name: 'ORUBAY / OB-OR', areas: [{ name: 'ORUBAY', capacity: 1 }, { name: 'OB-OR', capacity: 1 }] },
  { name: 'CALCETA / BOOL / TALIBON', areas: [{ name: 'CALCETA', capacity: 1 }, { name: 'BOOL', capacity: 1 }, { name: 'TALIBON', capacity: 1 }] },
  { name: 'GCGMMC / RICH', areas: [{ name: 'GCGMMC', capacity: 1 }, { name: 'RICH', capacity: 1 }] },
  { name: 'GCGMC / ORTHO / ACEMED', areas: [{ name: 'GCGMC', capacity: 1 }, { name: 'ORTHO', capacity: 1 }, { name: 'ACEMED', capacity: 1 }] },
  { name: 'LIBERTAD', areas: [{ name: 'LIBERTAD', capacity: 1 }] },
  { name: 'LOWER / UPPER / FARMED', areas: [{ name: 'LOWER', capacity: 1 }, { name: 'UPPER', capacity: 1 }, { name: 'FARMED', capacity: 1 }] },
]

export const shifts = ['AM', 'PM', 'NOC']

export function getGroups(count: number) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => `G${index + 1}`)
}

function shuffle<T>(items: T[]) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const item = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = item
  }
  return shuffled
}

export function validateAssignments(
  assignments: Assignment[],
  groupCount: number,
  weekCount: number,
  categories: RotationCategory[],
  allowSpecialRepeats: boolean,
) {
  const errors: string[] = []
  const groups = getGroups(groupCount)
  const specialCategories = new Set(['OR DIDACTICS', 'ORUBAY / OB-OR'])
  const categoryNames = new Set(categories.map((category) => category.name))
  const areaNames = new Set(categories.flatMap((category) => category.areas.map((area) => area.name)))

  if (new Set(categories.map((category) => category.name.trim())).size !== categories.length || categories.some((category) => !category.name.trim())) {
    errors.push('Category names must be non-empty and unique.')
  }
  if (new Set([...areaNames].map((area) => area.trim())).size !== areaNames.size || categories.some((category) => !category.areas.length)) {
    errors.push('Area names must be non-empty and unique, and each category needs at least one area.')
  }
  if (categories.some((category) => category.areas.some((area) => !area.name.trim() || !Number.isInteger(area.capacity) || area.capacity < 1))) {
    errors.push('Every area needs a name and a positive whole-number capacity.')
  }

  for (const assignment of assignments) {
    const category = categories.find((item) => item.name === assignment.category)
    if (!groups.includes(assignment.group) || !categoryNames.has(assignment.category) || !category?.areas.some((area) => area.name === assignment.area) || !shifts.includes(assignment.shift) || assignment.week < 1 || assignment.week > weekCount) {
      errors.push(`${assignment.group} has an assignment outside the current schedule configuration.`)
    }
  }

  for (let week = 1; week <= weekCount; week += 1) {
    for (const group of groups) {
      const count = assignments.filter((assignment) => assignment.group === group && assignment.week === week).length
      if (count === 0) errors.push(`${group} is not assigned in Week ${week}.`)
      if (count > 1) errors.push(`${group} has multiple assignments in Week ${week}.`)
    }
  }

  for (const group of groups) {
    const groupAssignments = assignments.filter((assignment) => assignment.group === group)
    for (const category of categories) {
      if (!groupAssignments.some((assignment) => assignment.category === category.name)) {
        errors.push(`${group} has not completed ${category.name}.`)
      }
    }
    if (!allowSpecialRepeats) {
      for (const categoryName of specialCategories) {
        if (groupAssignments.filter((assignment) => assignment.category === categoryName).length > 1) {
          errors.push(`${group} repeats ${categoryName}, but Category 1/2 repetition is disabled.`)
        }
      }
    }
  }

  for (let week = 1; week <= weekCount; week += 1) {
    for (const category of categories) {
      for (const area of category.areas) {
        for (const shift of shifts) {
          const count = assignments.filter((assignment) => assignment.week === week && assignment.area === area.name && assignment.shift === shift).length
          if (count > 1) errors.push(`${area.name} has more than one group assigned to ${shift} in Week ${week}.`)
        }
      }
    }
  }

  return [...new Set(errors)]
}

export function createAssignments(
  groupCount: number,
  weekCount: number,
  categories: RotationCategory[],
  allowSpecialRepeats: boolean,
): Assignment[] {
  const groups = getGroups(groupCount)
  const assignments: Assignment[] = []
  const completed = new Map(groups.map((group) => [group, new Set<string>()]))
  const usage = new Map<string, number>()
  const specialCategories = new Set(['OR DIDACTICS', 'ORUBAY / OB-OR'])

  for (let week = 1; week <= weekCount; week += 1) {
    for (const [groupIndex, group] of groups.entries()) {
      const history = completed.get(group)!
      const uncompleted = categories.filter((category) => !history.has(category.name))
      const repeatable = categories.filter((category) => allowSpecialRepeats && specialCategories.has(category.name))
      const candidates = uncompleted.length ? uncompleted : repeatable
      if (!candidates.length) continue

      const orderedCandidates = shuffle(candidates).sort((left, right) => {
        const leftUsage = left.areas.reduce((total, area) => total + (usage.get(`${week}:${area.name}`) ?? 0), 0)
        const rightUsage = right.areas.reduce((total, area) => total + (usage.get(`${week}:${area.name}`) ?? 0), 0)
        return leftUsage - rightUsage
      })
      let assignment: Assignment | undefined

      for (const offset of orderedCandidates.keys()) {
        const category = orderedCandidates[(offset + groupIndex) % orderedCandidates.length]
        const options = shuffle(category.areas.flatMap((area) => shifts.map((shift) => ({ area, shift }))))
          .filter(({ area, shift }) => (usage.get(`${week}:${area.name}:${shift}`) ?? 0) < 1)
          .sort((left, right) => (usage.get(`${week}:${left.area.name}:${left.shift}`) ?? 0) - (usage.get(`${week}:${right.area.name}:${right.shift}`) ?? 0))
        if (options.length) {
          const selected = options[0]
          assignment = { group, category: category.name, area: selected.area.name, week, shift: selected.shift }
          break
        }
      }

      if (!assignment) continue
      assignments.push(assignment)
      history.add(assignment.category)
      const key = `${week}:${assignment.area}:${assignment.shift}`
      usage.set(key, (usage.get(key) ?? 0) + 1)
    }
  }

  return assignments
}