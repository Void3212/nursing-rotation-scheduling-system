export type RotationArea = { name: string; capacity: number; allowNoc?: boolean; requiredEachWeek?: boolean }
export type RotationCategory = { name: string; areas: RotationArea[] }
export type Assignment = { group: string; category: string; area: string; week: number; shift: string }

export function isScheduleWarning(message: string) {
  return message.includes(' is not assigned in Week ') || message.includes(' has not completed ')
}

export function scorePreferredAssignments(assignments: Assignment[], preferredSchedules: Assignment[][]) {
  const preferenceCounts = new Map<string, Map<string, number>>()
  for (const schedule of preferredSchedules) {
    for (const assignment of schedule) {
      const groupWeek = `${assignment.group}:${assignment.week}`
      const signature = `${assignment.category}\u0000${assignment.area}\u0000${assignment.shift}`
      const counts = preferenceCounts.get(groupWeek) ?? new Map<string, number>()
      counts.set(signature, (counts.get(signature) ?? 0) + 1)
      preferenceCounts.set(groupWeek, counts)
    }
  }

  return assignments.reduce((score, assignment) => {
    const groupWeek = `${assignment.group}:${assignment.week}`
    const signature = `${assignment.category}\u0000${assignment.area}\u0000${assignment.shift}`
    return score + (preferenceCounts.get(groupWeek)?.get(signature) ?? 0)
  }, 0)
}

export const defaultCategories: RotationCategory[] = [
  { name: 'OR DIDACTICS', areas: [{ name: 'OR DIDACTICS', capacity: 1, allowNoc: true }] },
  { name: 'ORUBAY / OB-OR', areas: [{ name: 'ORUBAY', capacity: 1, allowNoc: true }, { name: 'OB-OR', capacity: 1, allowNoc: true }] },
  { name: 'CALCETA / BOOL / TALIBON', areas: [{ name: 'CALCETA', capacity: 1, allowNoc: true }, { name: 'BOOL', capacity: 1, allowNoc: true }, { name: 'TALIBON', capacity: 1, allowNoc: true }] },
  { name: 'GCGMMC / RICH', areas: [{ name: 'GCGMMC', capacity: 1, allowNoc: true }, { name: 'RICH', capacity: 1, allowNoc: true }] },
  { name: 'GCGMC / ORTHO / ACEMED', areas: [{ name: 'GCGMC', capacity: 1, allowNoc: true }, { name: 'ORTHO', capacity: 1, allowNoc: true }, { name: 'ACEMED', capacity: 1, allowNoc: true }] },
  { name: 'LIBERTAD', areas: [{ name: 'LIBERTAD', capacity: 1, allowNoc: true }] },
  { name: 'LOWER / UPPER / FARMED', areas: [{ name: 'LOWER', capacity: 1, allowNoc: true }, { name: 'UPPER', capacity: 1, allowNoc: true }, { name: 'FARMED', capacity: 1, allowNoc: true }] },
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
  if (categories.some((category) => category.areas.some((area) => !area.name.trim() || !Number.isInteger(area.capacity) || area.capacity < 1 || area.capacity > 100))) {
    errors.push('Every area needs a name and a whole-number shift capacity between 1 and 100.')
  }

  for (const assignment of assignments) {
    const category = categories.find((item) => item.name === assignment.category)
    if (!groups.includes(assignment.group) || !categoryNames.has(assignment.category) || !category?.areas.some((area) => area.name === assignment.area) || !shifts.includes(assignment.shift) || assignment.week < 1 || assignment.week > weekCount) {
      errors.push(`${assignment.group} has an assignment outside the current schedule configuration.`)
    }
    if (assignment.shift === 'NOC' && category?.areas.some((area) => area.name === assignment.area && area.allowNoc === false)) {
      errors.push(`${assignment.area} is not available for NOC assignments.`)
    }
  }

  for (let week = 1; week <= weekCount; week += 1) {
    for (const category of categories) {
      for (const area of category.areas.filter((item) => item.requiredEachWeek)) {
        if (!assignments.some((assignment) => assignment.week === week && assignment.category === category.name && assignment.area === area.name)) {
          errors.push(`${area.name} is required to have an assignment in Week ${week}.`)
        }
      }
    }
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
          if (count > area.capacity) errors.push(`${area.name} exceeds its maximum of ${area.capacity} groups for ${shift} in Week ${week}.`)
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
  const requiredAssignments = new Map<string, { category: RotationCategory; area: RotationArea }>()
  const reservedCategories = new Map(groups.map((group) => [group, new Set<string>()]))
  const requiredSlots = Array.from({ length: weekCount }, (_, index) => index + 1)
    .flatMap((week) => categories.flatMap((category) => category.areas
      .filter((area) => area.requiredEachWeek)
      .map((area) => ({ week, category, area }))))
    .sort((left, right) => left.week - right.week)

  for (const slot of requiredSlots) {
    const candidates = shuffle(groups).filter((group) => {
      const groupWeekKey = `${slot.week}:${group}`
      const groupCategories = reservedCategories.get(group)!
      const categoryAlreadyReserved = groupCategories.has(slot.category.name)
      return !requiredAssignments.has(groupWeekKey)
        && !categoryAlreadyReserved
    }).sort((left, right) => reservedCategories.get(left)!.size - reservedCategories.get(right)!.size)
    const group = candidates[0]
    if (!group) continue
    requiredAssignments.set(`${slot.week}:${group}`, { category: slot.category, area: slot.area })
    reservedCategories.get(group)!.add(slot.category.name)
  }

  for (let week = 1; week <= weekCount; week += 1) {
    const assignedThisWeek = new Set<string>()
    const categoryAmCapacity = (category: RotationCategory) =>
      category.areas.reduce((total, area) => total + area.capacity, 0)
    const categoryAmUsage = (category: RotationCategory) =>
      category.areas.reduce((total, area) => total + (usage.get(`${week}:${area.name}:AM`) ?? 0), 0)
    for (const group of groups) {
      const reservation = requiredAssignments.get(`${week}:${group}`)
      if (!reservation) continue
      const { category, area } = reservation
      const availableShifts = shuffle(shifts.filter((shift) =>
        (shift !== 'NOC' || area.allowNoc !== false)
        && (shift !== 'PM' || categoryAmUsage(category) >= categoryAmCapacity(category))
        && (usage.get(`${week}:${area.name}:${shift}`) ?? 0) < area.capacity,
      )).sort((left, right) =>
        shifts.indexOf(left) - shifts.indexOf(right)
        || (usage.get(`${week}:${area.name}:${left}`) ?? 0) - (usage.get(`${week}:${area.name}:${right}`) ?? 0),
      )
      const shift = availableShifts[0]
      if (!shift) continue
      assignments.push({ group, category: category.name, area: area.name, week, shift })
      completed.get(group)!.add(category.name)
      assignedThisWeek.add(group)
      const key = `${week}:${area.name}:${shift}`
      usage.set(key, (usage.get(key) ?? 0) + 1)
    }

    const slots = shuffle(categories.flatMap((category) => category.areas.flatMap((area) =>
      shifts.flatMap((shift) => Array.from(
        { length: Math.max(0, area.capacity - (usage.get(`${week}:${area.name}:${shift}`) ?? 0)) },
        () => ({ category, area, shift }),
      )),
    )))

    for (const shift of shifts) {
      const availableSlots = slots.filter((slot) =>
        slot.shift === shift
        && (shift !== 'PM' || categoryAmUsage(slot.category) >= categoryAmCapacity(slot.category)),
      )
      const optionsByGroup = new Map<string, number[]>()
      for (const group of groups) {
        if (assignedThisWeek.has(group)) continue
        const history = completed.get(group)!
        const uncompleted = categories.filter((category) => !history.has(category.name) && !reservedCategories.get(group)!.has(category.name))
        const repeatable = categories.filter((category) => allowSpecialRepeats && specialCategories.has(category.name) && !reservedCategories.get(group)!.has(category.name))
        const candidates = uncompleted.length ? uncompleted : repeatable
        const categoryNames = new Set(candidates.map((category) => category.name))
        optionsByGroup.set(group, shuffle(availableSlots.flatMap((slot, index) =>
          categoryNames.has(slot.category.name) && (slot.shift !== 'NOC' || slot.area.allowNoc !== false) ? [index] : [],
        )))
      }

      const slotOwners = new Map<number, string>()
      const groupSlots = new Map<string, number>()
      function matchGroup(group: string, visitedSlots: Set<number>): boolean {
        for (const slotIndex of optionsByGroup.get(group) ?? []) {
          if (visitedSlots.has(slotIndex)) continue
          visitedSlots.add(slotIndex)
          const currentOwner = slotOwners.get(slotIndex)
          if (!currentOwner || matchGroup(currentOwner, visitedSlots)) {
            slotOwners.set(slotIndex, group)
            groupSlots.set(group, slotIndex)
            return true
          }
        }
        return false
      }

      const unassignedGroups = [...optionsByGroup.keys()].sort((left, right) =>
        (optionsByGroup.get(left)?.length ?? 0) - (optionsByGroup.get(right)?.length ?? 0),
      )
      for (const group of unassignedGroups) matchGroup(group, new Set())

      for (const [group, slotIndex] of groupSlots) {
        const { category, area } = availableSlots[slotIndex]
        assignments.push({ group, category: category.name, area: area.name, week, shift })
        assignedThisWeek.add(group)
        completed.get(group)!.add(category.name)
        const key = `${week}:${area.name}:${shift}`
        usage.set(key, (usage.get(key) ?? 0) + 1)
      }
    }
  }

  return assignments
}