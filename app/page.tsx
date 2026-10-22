'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { createAssignments, defaultCategories, getGroups, shifts, validateAssignments, type Assignment, type RotationCategory } from '@/lib/scheduler'
import { isSupabaseConfigured, readLocalSchedules, writeLocalSchedules, type SavedSchedule } from '@/lib/schedule-storage'
import './features.css'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileText,
  Grid3X3,
  Hospital,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from 'lucide-react'

type NavItem = { label: string; icon: typeof LayoutDashboard; badge?: string }
const nav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Schedule Setup', icon: SlidersHorizontal },
  { label: 'Generate Schedule', icon: Sparkles },
  { label: 'Schedule', icon: CalendarDays },
  { label: 'Saved Schedules', icon: FileText },
  { label: 'Validation', icon: ClipboardCheck },
  { label: 'Group Tracking', icon: Users },
  { label: 'Category Tracking', icon: Grid3X3 },
  { label: 'Weekly Tracking', icon: BarChart3 },
  { label: 'Suggestions', icon: Activity },
]


function StatCard({ label, value, detail, icon: Icon, tone = 'navy' }: { label: string; value: string; detail: string; icon: typeof Users; tone?: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon /></div><div><p className="eyebrow">{label}</p><p className="stat-value">{value}</p><p className="stat-detail">{detail}</p></div></div>
}

export default function Page() {
  const [active, setActive] = useState('Dashboard')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [isGenerated, setIsGenerated] = useState(false)
  const [categories, setCategories] = useState<RotationCategory[]>(defaultCategories)
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [cloudUserEmail, setCloudUserEmail] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authStatus, setAuthStatus] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [groupCount, setGroupCount] = useState(30)
  const [weekCount, setWeekCount] = useState(8)
  const [allowSpecialRepeats, setAllowSpecialRepeats] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [showExcelPreview, setShowExcelPreview] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [isFixingSchedule, setIsFixingSchedule] = useState(false)
  const [fixStatus, setFixStatus] = useState('')

  useEffect(() => {
    const savedConfig = localStorage.getItem('clinica.schedule-config.v1')
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig) as { groupCount?: number; weekCount?: number; allowSpecialRepeats?: boolean; categories?: RotationCategory[] }
        if (config.groupCount) setGroupCount(config.groupCount)
        if (config.weekCount) setWeekCount(config.weekCount)
        if (typeof config.allowSpecialRepeats === 'boolean') setAllowSpecialRepeats(config.allowSpecialRepeats)
        if (config.categories?.length) setCategories(config.categories)
      } catch {
        localStorage.removeItem('clinica.schedule-config.v1')
      }
    }
    setSavedSchedules(readLocalSchedules())
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    localStorage.setItem('clinica.schedule-config.v1', JSON.stringify({ groupCount, weekCount, allowSpecialRepeats, categories }))
    writeLocalSchedules(savedSchedules)
  }, [isHydrated, groupCount, weekCount, allowSpecialRepeats, categories, savedSchedules])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setCloudUserEmail(data.session?.user.email ?? '')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudUserEmail(session?.user.email ?? '')
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!cloudUserEmail) return
    const supabase = createClient()
    void supabase.from('rotation_schedules').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (!data?.length) return
      const remoteSchedules = data.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        groupCount: row.group_count,
        weekCount: row.week_count,
        allowSpecialRepeats: row.allow_special_repeats,
        categories: row.categories as RotationCategory[],
        assignments: row.assignments as Assignment[],
        validationErrors: row.validation_errors as string[],
      })) satisfies SavedSchedule[]
      setSavedSchedules((current) => [...remoteSchedules, ...current.filter((item) => !remoteSchedules.some((remote) => remote.id === item.id))])
    })
  }, [cloudUserEmail])


  function generate() {
    const nextAssignments = createAssignments(groupCount, weekCount, categories, allowSpecialRepeats)
    setAssignments(nextAssignments)
    setValidationErrors(validateAssignments(nextAssignments, groupCount, weekCount, categories, allowSpecialRepeats))
    setFixStatus('')
    setIsGenerated(true)
    setSelectedWeek(0)
    setSearch('')
    setSaveStatus('')
    setActive('Schedule')
  }

  async function fixSchedule() {
    if (!isGenerated || validationErrors.length === 0 || isFixingSchedule) return
    setIsFixingSchedule(true)
    setFixStatus('Trying alternative schedules against the current rules…')
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))

    let bestAssignments = assignments
    let bestErrors = validationErrors
    for (let attempt = 0; attempt < 25 && bestErrors.length > 0; attempt += 1) {
      const candidate = createAssignments(groupCount, weekCount, categories, allowSpecialRepeats)
      const errors = validateAssignments(candidate, groupCount, weekCount, categories, allowSpecialRepeats)
      if (errors.length < bestErrors.length || (errors.length === bestErrors.length && candidate.length > bestAssignments.length)) {
        bestAssignments = candidate
        bestErrors = errors
      }
    }

    setAssignments(bestAssignments)
    setValidationErrors(bestErrors)
    setFixStatus(bestErrors.length === 0
      ? 'All validation issues were resolved.'
      : `Best schedule found after 25 attempts; ${bestErrors.length} validation issue${bestErrors.length === 1 ? '' : 's'} remain. Review the validation details below.`,
    )
    setIsFixingSchedule(false)
  }

  function configurationChanged() {
    setIsGenerated(false)
    setFixStatus('')
    if (assignments.length) setValidationErrors(['Configuration changed. Regenerate before saving or publishing this schedule.'])
  }

  function changeGroupCount(count: number) {
    setGroupCount(count)
    configurationChanged()
  }

  function changeWeekCount(count: number) {
    setWeekCount(count)
    configurationChanged()
  }

  function changeRepeatRule(allow: boolean) {
    setAllowSpecialRepeats(allow)
    configurationChanged()
  }

  function changeCategories(nextCategories: RotationCategory[]) {
    setCategories(nextCategories)
    configurationChanged()
  }

  async function saveSchedule() {
    if (!isGenerated) return
    setSaveStatus('Saving…')
    const schedule: SavedSchedule = {
      id: crypto.randomUUID(), name: `Clinical rotation schedule · ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(), groupCount, weekCount, allowSpecialRepeats,
      categories, assignments, validationErrors,
    }
    setSavedSchedules((current) => [schedule, ...current])
    if (!isSupabaseConfigured()) {
      setSaveStatus('Saved on this device')
      return
    }
    const { data, error } = await createClient().from('rotation_schedules').insert({
      id: schedule.id,
      name: schedule.name,
      group_count: groupCount,
      week_count: weekCount,
      allow_special_repeats: allowSpecialRepeats,
      categories,
      assignments,
      validation_errors: validationErrors,
    }).select('id').single()
    if (error) {
      setSaveStatus(`Saved on this device; cloud save failed: ${error.message}`)
      return
    }
    setSavedSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, id: data.id } : item))
    setSaveStatus('Saved and synced to Supabase')
  }

  async function sendSignInLink() {
    if (!authEmail.trim()) {
      setAuthStatus('Enter your email address first.')
      return
    }
    setAuthStatus('Sending sign-in link…')
    const { error } = await createClient().auth.signInWithOtp({ email: authEmail.trim(), options: { emailRedirectTo: window.location.origin } })
    setAuthStatus(error ? error.message : 'Check your email for a secure sign-in link.')
  }

  async function signOut() {
    const { error } = await createClient().auth.signOut()
    setAuthStatus(error ? error.message : 'Signed out of Supabase.')
  }

  function restoreDefaults() {
    setGroupCount(30)
    setWeekCount(8)
    setCategories(defaultCategories)
    setAllowSpecialRepeats(true)
    configurationChanged()
  }

  function loadSchedule(schedule: SavedSchedule) {
    setGroupCount(schedule.groupCount)
    setWeekCount(schedule.weekCount)
    setAllowSpecialRepeats(schedule.allowSpecialRepeats)
    setCategories(schedule.categories)
    setAssignments(schedule.assignments)
    setValidationErrors(schedule.validationErrors)
    setIsGenerated(true)
    setSelectedWeek(0)
    setSearch('')
    setActive('Schedule')
  }

  function updateAssignment(group: string, week: number, field: 'area' | 'shift', value: string) {
    let nextValue = value
    if (field === 'shift' && value === 'NOC') {
      const current = assignments.find((assignment) => assignment.group === group && assignment.week === week)
      const area = categories.find((category) => category.name === current?.category)?.areas.find((item) => item.name === current?.area)
      if (area?.allowNoc === false) nextValue = 'AM'
    }
    const nextAssignments = assignments.map((assignment) => assignment.group === group && assignment.week === week ? { ...assignment, [field]: nextValue } : assignment)
    setAssignments(nextAssignments)
    setValidationErrors(validateAssignments(nextAssignments, groupCount, weekCount, categories, allowSpecialRepeats))
    setFixStatus('')
  }

  function removeSchedule(schedule: SavedSchedule) {
    setSavedSchedules((current) => current.filter((item) => item.id !== schedule.id))
    if (isSupabaseConfigured()) void createClient().from('rotation_schedules').delete().eq('id', schedule.id)
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Stethoscope /></div><div><strong>SchedMom</strong><span>Rotation Planner</span></div></div>
      <div className="workspace-switcher"><div className="workspace-avatar">NU</div><div><strong>Nursing rotation workspace</strong><span>{groupCount} groups · {weekCount} weeks</span></div></div>
      <div className="nav-section"><p className="nav-label">Workspace</p>{nav.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => { setActive(label); setMobileNavOpen(false) }}><Icon /><span>{label}</span></button>)}</div>
      <div className="nav-section bottom-nav"><p className="nav-label">Administration</p><button className={`nav-item ${active === 'Settings' ? 'active' : ''}`} onClick={() => { setActive('Settings'); setMobileNavOpen(false) }}><Settings2 /><span>Settings</span></button><div className="sidebar-help"><div className="help-icon"><ShieldCheck /></div><div><strong>{cloudUserEmail ? 'Cloud connected' : 'Device storage'}</strong><span>{cloudUserEmail || (isSupabaseConfigured() ? 'Sign in to sync' : 'Local schedule storage')}</span></div></div></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="mobile-brand"><button className="icon-button" aria-label="Open navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(!mobileNavOpen)}><Menu /></button><strong>SchedMom</strong></div><div className="breadcrumbs"><span>Workspace</span><ArrowRight /><strong>{active}</strong></div><div className="top-actions"><span className="connection-label">{cloudUserEmail ? 'Cloud synced' : 'On this device'}</span></div></header>

      <div className="page-content">
        {active === 'Dashboard' && <DashboardView groupCount={groupCount} weekCount={weekCount} categories={categories} assignments={assignments} validationErrors={validationErrors} savedSchedules={savedSchedules} generate={generate} openSavedSchedules={() => setActive('Saved Schedules')} openValidation={() => setActive('Validation')} loadSchedule={loadSchedule} onNavigate={setActive} />}
        {false && active === 'Dashboard' && <>
          <div className="page-heading"><div><p className="eyebrow accent">MONDAY, AUGUST 19, 2024</p><h1>Good morning, Jordan.</h1><p className="subheading">Here is the current status of your clinical rotation schedule.</p></div><div className="heading-actions"><Button variant="outline" onClick={() => setShowSetup(!showSetup)}><Settings2 data-icon="inline-start" /> Configure</Button><Button onClick={generate}><Sparkles data-icon="inline-start" /> Generate schedule</Button></div></div>
          <div className="stats-grid"><StatCard label="Student groups" value={String(groupCount)} detail="All groups active" icon={Users} tone="teal" /><StatCard label="Categories" value="7" detail="12 clinical areas" icon={Hospital} tone="blue" /><StatCard label="Rotation weeks" value={String(weekCount)} detail="Aug 26 – Oct 18" icon={CalendarDays} tone="orange" /><StatCard label="Schedule status" value={isGenerated ? 'Ready' : 'Draft'} detail={isGenerated ? '2 warnings to review' : 'Awaiting generation'} icon={ClipboardCheck} tone="green" /></div>
          <div className="dashboard-grid"><section className="card schedule-overview"><div className="card-header"><div><h2>Schedule overview</h2><p>Weekly assignment distribution across all groups</p></div><button className="text-button" onClick={() => setActive('Schedule')}>View schedule <ArrowRight /></button></div><div className="chart-area"><div className="y-axis"><span>30</span><span>20</span><span>10</span><span>0</span></div><div className="bar-chart">{[72, 86, 63, 90, 78, 95, 82, 70].map((height, i) => <div className="bar-column" key={i}><div className="bar-stack"><div className="bar teal" style={{ height: `${height * .58}%` }} /><div className="bar blue" style={{ height: `${height * .25}%` }} /><div className="bar pale" style={{ height: `${height * .17}%` }} /></div><span>W{i + 1}</span></div>)}</div></div><div className="chart-legend"><span><i className="dot teal-dot" />Completed</span><span><i className="dot blue-dot" />In progress</span><span><i className="dot pale-dot" />Unassigned</span></div></section><section className="card validation-card"><div className="card-header"><div><h2>Validation status</h2><p>Latest schedule checks</p></div><button className="kebab"><MoreHorizontal /></button></div><div className="validation-score"><div className="score-ring"><span>94</span><small>%</small></div><div><strong>Almost there</strong><p>2 items need your attention</p></div></div><div className="check-list"><div className="check-row"><span className="check success"><Check /></span><span>All groups accounted for</span><b>Pass</b></div><div className="check-row"><span className="check success"><Check /></span><span>Area capacities respected</span><b>Pass</b></div><div className="check-row"><span className="check warning"><AlertTriangle /></span><span>Category repetition rules</span><b className="warn-text">Review</b></div><div className="check-row"><span className="check warning"><AlertTriangle /></span><span>Week 4 completeness</span><b className="warn-text">Review</b></div></div><button className="full-button" onClick={() => setActive('Validation')}>Open validation report <ArrowRight /></button></section></div>
          <div className="bottom-grid"><section className="card recent-card"><div className="card-header"><div><h2>Recent schedules</h2><p>Saved schedule versions</p></div><button className="text-button" onClick={() => setActive('Saved Schedules')}>View all <ArrowRight /></button></div><div className="schedule-list"><div className="schedule-row"><div className="file-icon"><FileText /></div><div><strong>Fall 2024 Clinical Rotations</strong><span>Updated today at 9:42 AM · 30 groups</span></div><span className="status-pill ready">Ready</span><MoreHorizontal /></div><div className="schedule-row"><div className="file-icon"><FileText /></div><div><strong>Summer 2024 Rotation Plan</strong><span>Updated Jun 28 · 24 groups</span></div><span className="status-pill archived">Archived</span><MoreHorizontal /></div></div></section><section className="card suggestions-card"><div className="card-header"><div><h2>Suggested fixes</h2><p>Based on your latest validation</p></div><span className="count-badge">3</span></div><div className="suggestion"><div className="suggestion-icon orange"><AlertTriangle /></div><div><strong>Review Category 1 + 2</strong><p>Repetition rule may affect 4 groups</p></div><button><ArrowRight /></button></div><div className="suggestion"><div className="suggestion-icon blue"><RefreshCw /></div><div><strong>Rebalance Week 4</strong><p>Move G17 to an open PM slot</p></div><button><ArrowRight /></button></div></section></div>
        </>}

        {active === 'Schedule' && <ScheduleWorkspace weekCount={weekCount} groupCount={groupCount} categories={categories} validationErrors={validationErrors} assignments={assignments} selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek} search={search} setSearch={setSearch} generate={generate} fixSchedule={fixSchedule} isFixingSchedule={isFixingSchedule} fixStatus={fixStatus} saveSchedule={saveSchedule} saveStatus={saveStatus} isGenerated={isGenerated} showExcelPreview={showExcelPreview} setShowExcelPreview={setShowExcelPreview} updateAssignment={updateAssignment} />}
        {active === 'Schedule Setup' && <><SetupWorkspace groupCount={groupCount} setGroupCount={changeGroupCount} weekCount={weekCount} setWeekCount={changeWeekCount} resetConfiguration={restoreDefaults} generate={generate} allowSpecialRepeats={allowSpecialRepeats} setAllowSpecialRepeats={changeRepeatRule} /><CategoryEditor categories={categories} setCategories={changeCategories} /></>}
        {active === 'Saved Schedules' && <SavedSchedulesView schedules={savedSchedules} loadSchedule={loadSchedule} removeSchedule={removeSchedule} />}
        {['Validation', 'Group Tracking', 'Category Tracking', 'Weekly Tracking', 'Suggestions', 'Settings', 'Generate Schedule'].includes(active) && <PlaceholderView active={active} generate={generate} assignments={assignments} groupCount={groupCount} weekCount={weekCount} categories={categories} validationErrors={validationErrors} cloudEnabled={isSupabaseConfigured()} cloudUserEmail={cloudUserEmail} authEmail={authEmail} setAuthEmail={setAuthEmail} authStatus={authStatus} sendSignInLink={sendSignInLink} signOut={signOut} onNavigate={setActive} />}
      </div>
    </main>
    {showSetup && <div className="quick-panel"><div className="panel-title"><div><p className="eyebrow accent">QUICK SETUP</p><h2>Schedule configuration</h2></div><button onClick={() => setShowSetup(false)}><X /></button></div><label>Student groups<input type="number" value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value))} /></label><label>Rotation weeks<input type="number" value={weekCount} onChange={(e) => setWeekCount(Number(e.target.value))} /></label><div className="panel-note"><ShieldCheck /> Changes are applied to the next generated schedule.</div><Button className="w-full" onClick={() => { setShowSetup(false); generate() }}>Save and generate</Button></div>}
  </div>
}

function ScheduleView({ weekCount, groupCount, categories, validationErrors, assignments, selectedWeek, setSelectedWeek, search, setSearch, generate, saveSchedule, saveStatus, isGenerated, showExcelPreview, setShowExcelPreview, updateAssignment }: { weekCount: number; groupCount: number; categories: RotationCategory[]; validationErrors: string[]; assignments: Assignment[]; selectedWeek: number; setSelectedWeek: (n: number) => void; search: string; setSearch: (v: string) => void; generate: () => void; saveSchedule: () => Promise<void>; saveStatus: string; isGenerated: boolean; showExcelPreview: boolean; setShowExcelPreview: (value: boolean) => void; updateAssignment: (group: string, week: number, field: 'area' | 'shift', value: string) => void }) {
  const grouped = categories.flatMap((category) => category.areas.map((area) => ({ category: category.name, area: area.name, rows: assignments.filter((a) => a.category === category.name && a.area === area.name) })))
  const demoCategories = categories
  const excelDates = Array.from({ length: weekCount }, (_, index) => `Week ${index + 1}`)
  const excelRows = grouped.map((row) => ({ ...row, cells: excelDates.flatMap((_, weekIndex) => shifts.map((shift) => assignments.find((assignment) => assignment.week === weekIndex + 1 && assignment.area === row.area && assignment.shift === shift))) }))
  return <><div className="page-heading"><div><p className="eyebrow accent">LIVE WORKSPACE</p><h1>Clinical rotation schedule</h1><p className="subheading">Review, edit, and validate assignments for Fall 2024.</p></div><div className="heading-actions"><Button variant="outline" onClick={() => setShowExcelPreview(!showExcelPreview)}><Grid3X3 data-icon="inline-start" /> {showExcelPreview ? 'Hide Excel preview' : 'Excel preview'}</Button><Button variant="outline" onClick={saveSchedule} disabled={!isGenerated || saveStatus === 'Saving…'}><Download data-icon="inline-start" /> Save to Supabase</Button><Button variant="outline"><Download data-icon="inline-start" /> Export</Button><Button onClick={() => { if (window.confirm('Make sure to review or export the current schedule before regenerating. Regenerating will randomize the rotation assignments for all weeks. Continue?')) generate() }}><RefreshCw data-icon="inline-start" /> Regenerate</Button>{saveStatus && <span className="save-status" role="status">{saveStatus}</span>}</div></div><div className="schedule-toolbar"><div className="week-tabs"><button className={selectedWeek === 0 ? 'selected' : ''} onClick={() => setSelectedWeek(0)}>All weeks</button>{Array.from({ length: weekCount }, (_, i) => <button key={i} className={selectedWeek === i + 1 ? 'selected' : ''} onClick={() => setSelectedWeek(i + 1)}>Week {i + 1}</button>)}</div><div className="toolbar-actions"><div className="search-box"><Search /><input placeholder="Search groups or areas" value={search} onChange={(e) => setSearch(e.target.value)} /></div><button className="filter-button"><SlidersHorizontal /> Filters</button></div></div>{validationErrors.length > 0 && <div className="validation-alert"><AlertTriangle /><div><strong>Schedule needs attention</strong><ul>{validationErrors.slice(0, 5).map((error) => <li key={error}>{error}</li>)}</ul><small>Try increasing an area capacity, adding a week, moving a group, or enabling Category 1 + 2 repetition.</small></div></div>}{showExcelPreview && <div className="excel-preview card"><div className="excel-preview-header"><div><p className="eyebrow accent">SPREADSHEET VIEW</p><h2>Clinical rotation workbook preview</h2><p>Scroll horizontally to review the complete matrix exactly as it will appear in Excel.</p></div><span className="excel-file-label"><FileText /> Fall-2024-Rotations.xlsx</span></div><div className="excel-sheet-wrap"><table className="excel-sheet matrix-sheet"><thead><tr><th rowSpan={2} className="matrix-level">LEVEL III<br />(30)</th><th rowSpan={2} className="matrix-area">AREA</th>{excelDates.map((date) => <th key={date} colSpan={3} className="matrix-date">{date}</th>)}</tr><tr>{excelDates.flatMap((date) => ['AM', 'PM', 'NOC'].map((shift) => <th key={`${date}-${shift}`} className={`matrix-shift ${shift === 'NOC' ? 'noc' : ''}`}>{shift}</th>))}</tr></thead><tbody>{excelRows.map((row) => <tr key={row.area}><td className="matrix-level-cell">SKILLS</td><td className="matrix-area-cell">{row.area}<small>{row.category}</small></td>{row.cells.map((assignment, index) => <td key={index} className={`matrix-cell ${assignment ? 'filled' : ''}`}>{assignment ? <><b>{assignment.group}</b><small>{assignment.shift}</small></> : '—'}</td>)}</tr>)}</tbody></table></div></div>}<div className="schedule-meta"><span><i className="dot teal-dot" /> {isGenerated ? 'Schedule generated' : 'No schedule generated'}</span><span>Showing {assignments.length ? assignments.length : 0} assignments for Week {selectedWeek}</span><span className="meta-right">Last edited just now</span></div><div className="card schedule-table-card"><div className="table-scroll"><table className="schedule-table"><thead><tr><th className="category-col">Category / Area</th><th>AM <small>Morning</small></th><th>PM <small>Afternoon</small></th><th>NOC <small>Night</small></th><th className="capacity-col">Capacity</th></tr></thead><tbody>{grouped.map(({ category, area, rows }, index) => <tr key={area}><td><div className="area-name"><span className={`category-marker marker-${index % 4}`} /><div><strong>{area}</strong><small>{category}</small></div></div></td>{['AM', 'PM', 'NOC'].map((shift) => <td key={shift}><div className="assignment-list">{rows.filter((r) => r.shift === shift).map((r) => <span className="group-chip" key={r.group}>{r.group}</span>)}{!rows.some((r) => r.shift === shift) && <span className="empty-slot">—</span>}</div></td>)}<td><span className="capacity-badge">{demoCategories.flatMap((c) => c.areas).find((a) => a.name === area)?.capacity ?? 2} groups</span></td></tr>)}</tbody></table></div><div className="table-footer"><span><strong>{new Set(assignments.map((a) => a.group)).size}</strong> of 30 groups assigned</span><span><strong>{grouped.length}</strong> clinical areas <span className="footer-divider">·</span> Click a cell to edit</span></div></div></>
}

function SetupView({ groupCount, setGroupCount, weekCount, setWeekCount, loadDemo, generate, allowSpecialRepeats, setAllowSpecialRepeats }: { groupCount: number; setGroupCount: (n: number) => void; weekCount: number; setWeekCount: (n: number) => void; loadDemo: () => void; generate: () => void; allowSpecialRepeats: boolean; setAllowSpecialRepeats: (value: boolean) => void }) {
  return <><div className="page-heading"><div><p className="eyebrow accent">CONFIGURATION</p><h1>Schedule setup</h1><p className="subheading">Configure the rules that drive your clinical rotation schedule.</p></div><Button variant="outline" onClick={loadDemo}><Sparkles data-icon="inline-start" /> Load demo configuration</Button></div><div className="setup-layout"><div className="setup-steps card"><p className="eyebrow">SETUP WIZARD</p>{['Groups', 'Categories', 'Areas & capacities', 'Weeks', 'Shifts', 'Repetition rules'].map((item, i) => <button className={`setup-step ${i === 0 ? 'current' : ''}`} key={item}><span>{i < 2 ? <Check /> : i + 1}</span><div><strong>{item}</strong><small>{i < 2 ? 'Configured' : 'Not configured'}</small></div><ArrowRight /></button>)}</div><div className="card setup-form"><div className="card-header"><div><h2>Groups and rotation period</h2><p>Start with the number of student groups and weeks in this rotation.</p></div><span className="step-indicator">1 of 6</span></div><div className="form-grid"><label>Number of student groups<input type="number" min="1" max="100" value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value))} /><small>Groups will be generated as G1–G{groupCount}.</small></label><label>Number of rotation weeks<input type="number" min="1" max="24" value={weekCount} onChange={(e) => setWeekCount(Number(e.target.value))} /><small>Each week must account for every active group.</small></label></div><div className="group-preview"><div className="preview-header"><strong>Generated group labels</strong><button className="text-button">Edit labels <ArrowRight /></button></div><div className="chip-grid">{Array.from({ length: Math.min(groupCount, 18) }, (_, i) => <span key={i}>{`G${i + 1}`}</span>)}{groupCount > 18 && <span>+{groupCount - 18} more</span>}</div></div><label className="repeat-rule"><input type="checkbox" checked={allowSpecialRepeats} onChange={(event) => setAllowSpecialRepeats(event.target.checked)} /><span><strong>Allow Category 1 + Category 2 repetition</strong><small>Only OR DIDACTICS and ORUBAY / OB-OR may repeat when extra weeks require it.</small></span></label><div className="capacity-callout"><div className="callout-icon"><ShieldCheck /></div><div><strong>Capacity check is ready</strong><p>7 categories · 12 active areas · 3 shifts · {weekCount} weeks</p></div><span className="ready-label">Ready</span></div><div className="form-actions"><Button variant="outline">Save draft</Button><Button onClick={generate}>Continue to categories <ArrowRight data-icon="inline-end" /></Button></div></div></div></>
}

function SetupWorkspace({ groupCount, setGroupCount, weekCount, setWeekCount, resetConfiguration, generate, allowSpecialRepeats, setAllowSpecialRepeats }: { groupCount: number; setGroupCount: (count: number) => void; weekCount: number; setWeekCount: (count: number) => void; resetConfiguration: () => void; generate: () => void; allowSpecialRepeats: boolean; setAllowSpecialRepeats: (allow: boolean) => void }) {
  return <><div className="page-heading"><div><p className="eyebrow accent">CONFIGURATION</p><h1>Schedule setup</h1><p className="subheading">Define groups, rotation length and repetition rules. Changes are saved on this device.</p></div><Button variant="outline" onClick={resetConfiguration}><RefreshCw data-icon="inline-start" /> Restore defaults</Button></div><section className="card setup-form"><div className="card-header"><div><h2>Groups and rotation period</h2><p>Configure the schedule’s core dimensions.</p></div></div><div className="form-grid"><label>Number of student groups<input type="number" min="1" max="100" value={groupCount} onChange={(event) => setGroupCount(Math.min(100, Math.max(1, Number(event.target.value))))} /><small>Groups are labeled G1 through G{groupCount}.</small></label><label>Number of rotation weeks<input type="number" min="1" max="24" value={weekCount} onChange={(event) => setWeekCount(Math.min(24, Math.max(1, Number(event.target.value))))} /><small>Each group receives one assignment per week.</small></label></div><div className="group-preview"><div className="preview-header"><strong>Group labels</strong><span>{groupCount} total</span></div><div className="chip-grid">{Array.from({ length: Math.min(groupCount, 18) }, (_, index) => <span key={index}>G{index + 1}</span>)}{groupCount > 18 && <span>+{groupCount - 18} more</span>}</div></div><label className="repeat-rule"><input type="checkbox" checked={allowSpecialRepeats} onChange={(event) => setAllowSpecialRepeats(event.target.checked)} /><span><strong>Allow Category 1 + Category 2 repetition</strong><small>OR DIDACTICS and ORUBAY / OB-OR may repeat after all other categories are completed.</small></span></label><div className="capacity-callout"><div className="callout-icon"><ShieldCheck /></div><div><strong>Capacity is checked per shift</strong><p>AM, PM and NOC slots are counted separately for each area and week.</p></div></div><div className="form-actions"><span className="saved-config-label">Configuration saves automatically.</span><Button onClick={generate}>Generate schedule <ArrowRight data-icon="inline-end" /></Button></div></section></>
}

function CategoryEditor({ categories, setCategories }: { categories: RotationCategory[]; setCategories: (categories: RotationCategory[]) => void }) {
  function updateCategory(index: number, name: string) {
    setCategories(categories.map((category, categoryIndex) => categoryIndex === index ? { ...category, name } : category))
  }

  function updateArea(categoryIndex: number, areaIndex: number, field: 'name' | 'capacity', value: string) {
    if (field === 'capacity' && value !== '' && !Number.isFinite(Number(value))) return
    setCategories(categories.map((category, index) => index === categoryIndex ? {
      ...category,
      areas: category.areas.map((area, index) => {
        if (index !== areaIndex) return area
        return field === 'capacity'
          ? { ...area, capacity: value === '' ? 0 : Math.min(100, Math.max(1, Math.trunc(Number(value)))) }
          : { ...area, name: value }
      }),
    } : category))
  }

  function updateAreaRule(categoryIndex: number, areaIndex: number, field: 'allowNoc' | 'requiredEachWeek', checked: boolean) {
    setCategories(categories.map((category, index) => index === categoryIndex ? {
      ...category,
      areas: category.areas.map((area, index) => index === areaIndex ? { ...area, [field]: checked } : area),
    } : category))
  }

  return <section className="card category-editor"><div className="card-header"><div><h2>Categories and areas</h2><p>Set per-shift capacity, NOC eligibility, and whether an area must be scheduled every week. If another rule prevents coverage, validation will identify the missing week.</p></div><Button variant="outline" onClick={() => setCategories([...categories, { name: `New category ${categories.length + 1}`, areas: [{ name: `New area ${categories.length + 1}`, capacity: 1, allowNoc: true, requiredEachWeek: false }] }])}><Plus data-icon="inline-start" /> Add category</Button></div><div className="category-editor-list">{categories.map((category, categoryIndex) => <div className={`category-editor-row category-tone-${categoryIndex % 7}`} key={categoryIndex}><label>Category<input value={category.name} onChange={(event) => updateCategory(categoryIndex, event.target.value)} /></label><div className="area-editor-list">{category.areas.map((area, areaIndex) => <div className="area-editor" key={areaIndex}><input aria-label="Area name" value={area.name} onChange={(event) => updateArea(categoryIndex, areaIndex, 'name', event.target.value)} /><label>Maximum groups / shift<input aria-label={`Maximum groups per shift for ${area.name}`} type="number" min="1" max="100" step="1" value={area.capacity || ''} onChange={(event) => updateArea(categoryIndex, areaIndex, 'capacity', event.target.value)} /></label><label className="area-rule-toggle"><input type="checkbox" checked={area.allowNoc !== false} onChange={(event) => updateAreaRule(categoryIndex, areaIndex, 'allowNoc', event.target.checked)} /><span>Allow NOC</span></label><label className="area-rule-toggle"><input type="checkbox" checked={area.requiredEachWeek === true} onChange={(event) => updateAreaRule(categoryIndex, areaIndex, 'requiredEachWeek', event.target.checked)} /><span>Required every week</span></label><button className="icon-button" title="Remove area" onClick={() => setCategories(categories.map((item, index) => index === categoryIndex ? { ...item, areas: item.areas.filter((_, itemIndex) => itemIndex !== areaIndex) } : item))}><X /></button></div>)}</div><div className="category-editor-actions"><Button variant="ghost" size="sm" onClick={() => setCategories(categories.map((item, index) => index === categoryIndex ? { ...item, areas: [...item.areas, { name: 'New area', capacity: 1, allowNoc: true, requiredEachWeek: false }] } : item))}><Plus data-icon="inline-start" /> Add area</Button><Button variant="ghost" size="sm" onClick={() => setCategories(categories.filter((_, index) => index !== categoryIndex))}><X data-icon="inline-start" /> Remove category</Button></div></div>)}</div></section>
}

function SavedSchedulesView({ schedules, loadSchedule, removeSchedule }: { schedules: SavedSchedule[]; loadSchedule: (schedule: SavedSchedule) => void; removeSchedule: (schedule: SavedSchedule) => void }) {
  return <><div className="page-heading"><div><p className="eyebrow accent">SCHEDULE LIBRARY</p><h1>Saved schedules</h1><p className="subheading">Restore a schedule or remove an outdated version.</p></div></div><section className="card tracking-card"><div className="tracking-table-wrap"><table className="tracking-table"><thead><tr><th>Name</th><th>Saved</th><th>Groups</th><th>Weeks</th><th>Issues</th><th>Actions</th></tr></thead><tbody>{schedules.map((schedule) => <tr key={schedule.id}><td><strong>{schedule.name}</strong></td><td>{new Date(schedule.createdAt).toLocaleString()}</td><td>{schedule.groupCount}</td><td>{schedule.weekCount}</td><td>{schedule.validationErrors.length}</td><td><Button size="sm" onClick={() => loadSchedule(schedule)}>Open</Button><Button variant="ghost" size="sm" onClick={() => removeSchedule(schedule)}>Delete</Button></td></tr>)}</tbody></table>{schedules.length === 0 && <p className="tracking-empty">No saved schedules yet. Generate and save a schedule to see it here.</p>}</div></section></>
}

function PlaceholderView({ active, generate, assignments, groupCount, weekCount, categories, validationErrors, cloudEnabled, cloudUserEmail, authEmail, setAuthEmail, authStatus, sendSignInLink, signOut, onNavigate }: { active: string; generate: () => void; assignments: Assignment[]; groupCount: number; weekCount: number; categories: RotationCategory[]; validationErrors: string[]; cloudEnabled: boolean; cloudUserEmail: string; authEmail: string; setAuthEmail: (email: string) => void; authStatus: string; sendSignInLink: () => Promise<void>; signOut: () => Promise<void>; onNavigate: (page: string) => void }) {
  const groups = getGroups(groupCount)
  const generated = assignments.length > 0
  const groupProgress = groups.map((group) => ({ group, completed: new Set(assignments.filter((assignment) => assignment.group === group).map((assignment) => assignment.category)) }))

  if (active === 'Generate Schedule') return <><div className="page-heading"><div><p className="eyebrow accent">CONSTRAINT ENGINE</p><h1>Generate schedule</h1><p className="subheading">Create assignments from your configured group, week, area and repetition rules.</p></div><Button onClick={generate}><Sparkles data-icon="inline-start" /> Generate schedule</Button></div><section className="card report-card"><h2>Generation inputs</h2><p>{groupCount} groups · {weekCount} weeks · {categories.length} categories · {categories.reduce((total, category) => total + category.areas.length, 0)} areas · AM / PM / NOC</p><p>{generated ? `${assignments.length} assignments generated; ${validationErrors.length} validation issues.` : 'No schedule has been generated for this configuration yet.'}</p></section></>

  if (active === 'Validation') return <><div className="page-heading"><div><p className="eyebrow accent">QUALITY CHECKS</p><h1>Validation report</h1><p className="subheading">Checks coverage, category completion, repetition rules and per-shift capacity.</p></div>{!generated && <Button onClick={generate}><Sparkles data-icon="inline-start" /> Generate schedule</Button>}</div><section className="card report-card"><div className="report-summary"><strong>{generated ? `${validationErrors.length} issues found` : 'No schedule to validate'}</strong><span>{generated ? `${assignments.length} assignments checked` : 'Generate a schedule to run the checks.'}</span></div>{validationErrors.length ? <ul className="issue-list">{validationErrors.map((error) => <li key={error}><AlertTriangle />{error}</li>)}</ul> : generated ? <p className="success-message"><Check /> All configured scheduling constraints pass.</p> : null}</section></>

  if (active === 'Group Tracking') return <><div className="page-heading"><div><p className="eyebrow accent">COMPLETION MATRIX</p><h1>Group tracking</h1><p className="subheading">Track each group’s completed clinical categories.</p></div></div><section className="card tracking-card"><div className="tracking-table-wrap"><table className="tracking-table"><thead><tr><th>Group</th>{categories.map((category) => <th key={category.name}>{category.name}</th>)}<th>Progress</th></tr></thead><tbody>{groupProgress.map(({ group, completed }) => <tr key={group}><th>{group}</th>{categories.map((category) => <td key={category.name}>{completed.has(category.name) ? <Check className="table-check" /> : '—'}</td>)}<td>{completed.size} / {categories.length}</td></tr>)}</tbody></table></div>{!generated && <p className="tracking-empty">Generate a schedule to populate group tracking.</p>}</section></>

  if (active === 'Category Tracking') return <><div className="page-heading"><div><p className="eyebrow accent">ROTATION COVERAGE</p><h1>Category tracking</h1><p className="subheading">See completion totals across all configured categories.</p></div></div><section className="card category-progress-list">{categories.map((category) => { const complete = groupProgress.filter(({ completed }) => completed.has(category.name)).length; return <div className="category-progress" key={category.name}><div><strong>{category.name}</strong><span>{complete} of {groupCount} groups</span></div><progress max={Math.max(1, groupCount)} value={complete} /></div> })}{!generated && <p className="tracking-empty">Generate a schedule to calculate category completion.</p>}</section></>

  if (active === 'Weekly Tracking') return <><div className="page-heading"><div><p className="eyebrow accent">WEEKLY COVERAGE</p><h1>Weekly tracking</h1><p className="subheading">Verify group coverage and shift distribution for every week.</p></div></div><section className="card tracking-card"><div className="tracking-table-wrap"><table className="tracking-table"><thead><tr><th>Week</th><th>Assigned</th><th>Missing</th>{shifts.map((shift) => <th key={shift}>{shift}</th>)}<th>Capacity issues</th></tr></thead><tbody>{Array.from({ length: weekCount }, (_, index) => { const week = index + 1; const rows = assignments.filter((assignment) => assignment.week === week); const present = new Set(rows.map((assignment) => assignment.group)); const weekErrors = validationErrors.filter((error) => error.includes(`Week ${week}`)); return <tr key={week}><th>Week {week}</th><td>{present.size} / {groupCount}</td><td>{groupCount - present.size}</td>{shifts.map((shift) => <td key={shift}>{rows.filter((assignment) => assignment.shift === shift).length}</td>)}<td>{weekErrors.length}</td></tr> })}</tbody></table></div>{!generated && <p className="tracking-empty">Generate a schedule to populate weekly tracking.</p>}</section></>

  if (active === 'Suggestions') return <><div className="page-heading"><div><p className="eyebrow accent">SCHEDULE ADVISOR</p><h1>Suggestions</h1><p className="subheading">Actions based on the current configuration and validation results.</p></div><Button variant="outline" onClick={() => onNavigate('Schedule Setup')}><Settings2 data-icon="inline-start" /> Review setup</Button></div><section className="card report-card">{validationErrors.length ? <ul className="issue-list">{validationErrors.slice(0, 20).map((error) => <li key={error}><AlertTriangle />{error}</li>)}</ul> : <p>{generated ? 'No fixes suggested. The schedule currently passes every validation.' : 'Generate a schedule to receive actionable suggestions.'}</p>}</section></>

  return <><div className="page-heading"><div><p className="eyebrow accent">WORKSPACE SETTINGS</p><h1>Settings</h1><p className="subheading">Current schedule configuration and persistence status.</p></div></div><section className="card report-card"><h2>Schedule defaults</h2><p>{groupCount} student groups · {weekCount} weeks · {categories.length} categories · {categories.reduce((total, category) => total + category.areas.length, 0)} areas</p><p>{cloudEnabled ? 'Schedules are saved on this device and can sync to the configured Supabase project.' : 'Schedules are saved on this device. Configure Supabase environment variables and apply the migration to enable cloud sync.'}</p></section>{cloudEnabled && <section className="card report-card auth-panel"><h2>Cloud account</h2>{cloudUserEmail ? <><p>Signed in as {cloudUserEmail}</p><Button variant="outline" onClick={() => void signOut()}>Sign out</Button></> : <><p>Sign in with a secure email link to sync schedules across devices.</p><div className="auth-form"><input type="email" autoComplete="email" placeholder="name@department.edu" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /><Button onClick={() => void sendSignInLink()}>Email sign-in link</Button></div></>}{authStatus && <p role="status">{authStatus}</p>}</section>}</>
}

function ScheduleWorkspace({ weekCount, groupCount, categories, validationErrors, assignments, selectedWeek, setSelectedWeek, search, setSearch, generate, fixSchedule, isFixingSchedule, fixStatus, saveSchedule, saveStatus, isGenerated, showExcelPreview, setShowExcelPreview, updateAssignment }: { weekCount: number; groupCount: number; categories: RotationCategory[]; validationErrors: string[]; assignments: Assignment[]; selectedWeek: number; setSelectedWeek: (week: number) => void; search: string; setSearch: (value: string) => void; generate: () => void; fixSchedule: () => Promise<void>; isFixingSchedule: boolean; fixStatus: string; saveSchedule: () => Promise<void>; saveStatus: string; isGenerated: boolean; showExcelPreview: boolean; setShowExcelPreview: (value: boolean) => void; updateAssignment: (group: string, week: number, field: 'area' | 'shift', value: string) => void }) {
  const [shiftFilter, setShiftFilter] = useState('All shifts')
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const activeCategoryFilter = categories.some((category) => category.name === categoryFilter) ? categoryFilter : 'All categories'
  const normalizedSearch = search.trim().toLowerCase()
  const matchingAssignments = assignments.filter((assignment) =>
    (selectedWeek === 0 || assignment.week === selectedWeek)
    && (shiftFilter === 'All shifts' || assignment.shift === shiftFilter)
    && (activeCategoryFilter === 'All categories' || assignment.category === activeCategoryFilter)
    && (!normalizedSearch || `${assignment.group} ${assignment.area} ${assignment.category}`.toLowerCase().includes(normalizedSearch)),
  )
  const areas = categories.flatMap((category, categoryIndex) => category.areas.map((area) => ({ ...area, category: category.name, categoryIndex })))
  const visibleAreas = areas.filter((area) => matchingAssignments.some((assignment) => assignment.area === area.name && assignment.category === area.category))
  const visibleSlots = visibleAreas.flatMap((area) => Array.from({ length: area.capacity }, (_, slotIndex) => ({ ...area, slotIndex })))

  function getSlotAssignments(area: typeof areas[number], shift: string, slotIndex: number, sourceAssignments: Assignment[]) {
    const assignmentsByWeek = new Map<number, Assignment[]>()
    sourceAssignments
      .filter((assignment) => assignment.category === area.category && assignment.area === area.name && assignment.shift === shift)
      .sort((left, right) => left.week - right.week || left.group.localeCompare(right.group, undefined, { numeric: true }))
      .forEach((assignment) => {
        const weekAssignments = assignmentsByWeek.get(assignment.week) ?? []
        weekAssignments.push(assignment)
        assignmentsByWeek.set(assignment.week, weekAssignments)
      })
    return [...assignmentsByWeek.values()]
      .map((weekAssignments) => weekAssignments[slotIndex])
      .filter((assignment): assignment is Assignment => assignment !== undefined)
  }

  function exportCsv() {
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const weekHeaders = Array.from({ length: weekCount }, (_, week) => [`Week ${week + 1}`, '', '']).flat()
    const shiftHeaders = Array.from({ length: weekCount }, () => shifts).flat()
    const rows = [
      ['AREA', ...weekHeaders],
      ['Category', ...shiftHeaders],
      ...areas.flatMap((area) => Array.from({ length: area.capacity }, (_, slotIndex) => [
        `${area.name}${area.capacity > 1 ? ` · Slot ${slotIndex + 1}` : ''}\n${area.category}`,
        ...Array.from({ length: weekCount }, (_, week) => shifts.map((shift) => {
          const assignment = assignments
            .filter((item) => item.category === area.category && item.area === area.name && item.week === week + 1 && item.shift === shift)
            .sort((left, right) => left.group.localeCompare(right.group, undefined, { numeric: true }))[slotIndex]
          return assignment?.group ?? '—'
        })).flat(),
      ])),
    ]
    const content = rows.map((row) => row.map(escape).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `clinical-rotations${selectedWeek ? `-week-${selectedWeek}` : ''}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow accent">LIVE WORKSPACE</p><h1>Clinical rotation schedule</h1><p className="subheading">{isGenerated ? `${assignments.length} assignments · ${validationErrors.length} validation issues` : 'Generate a schedule from your configured rotations.'}</p></div><div className="heading-actions"><Button variant="outline" onClick={() => setShowExcelPreview(!showExcelPreview)}><Grid3X3 data-icon="inline-start" /> {showExcelPreview ? 'Hide matrix' : 'Excel preview'}</Button><Button variant="outline" onClick={exportCsv} disabled={!assignments.length}><Download data-icon="inline-start" /> Export CSV</Button><Button variant="outline" onClick={saveSchedule} disabled={!isGenerated || saveStatus === 'Saving…'}><FileText data-icon="inline-start" /> Save schedule</Button><Button onClick={() => { if (window.confirm('Regenerate all assignments using the current setup?')) generate() }}><RefreshCw data-icon="inline-start" /> Regenerate</Button></div></div>
    {saveStatus && <p className="save-status" role="status">{saveStatus}</p>}
    {isGenerated && validationErrors.length > 0 && <div className="fix-schedule-actions"><Button variant="outline" onClick={() => void fixSchedule()} disabled={isFixingSchedule}><Sparkles data-icon="inline-start" /> {isFixingSchedule ? 'Trying fixes…' : 'Fix schedule'}</Button><span>Try up to 25 alternative schedules using the current setup and keep the one with fewer validation issues.</span></div>}
    {fixStatus && <p className="fix-status" role="status">{fixStatus}</p>}
    <div className="schedule-toolbar"><div className="week-tabs"><button className={selectedWeek === 0 ? 'selected' : ''} onClick={() => setSelectedWeek(0)}>All weeks</button>{Array.from({ length: weekCount }, (_, index) => <button key={index} className={selectedWeek === index + 1 ? 'selected' : ''} onClick={() => setSelectedWeek(index + 1)}>Week {index + 1}</button>)}</div><div className="toolbar-actions"><div className="search-box"><Search /><input placeholder="Search groups, areas, or categories" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="shift-filter" value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)} aria-label="Filter by shift"><option>All shifts</option>{shifts.map((shift) => <option key={shift}>{shift}</option>)}</select><select className="shift-filter" value={activeCategoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category"><option>All categories</option>{categories.map((category) => <option key={category.name}>{category.name}</option>)}</select></div></div>
    {!!validationErrors.length && <div className="validation-alert"><AlertTriangle /><div><strong>{validationErrors.length} validation issues</strong><ul>{validationErrors.slice(0, 5).map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
    {showExcelPreview && <section className="excel-preview card"><div className="excel-preview-header"><div><p className="eyebrow accent">SPREADSHEET VIEW</p><h2>Clinical rotation workbook</h2><p>Assignments reflect the current generated schedule.</p></div><span className="excel-file-label"><FileText /> Clinical-Rotations.csv</span></div><div className="excel-sheet-wrap"><table className="excel-sheet matrix-sheet"><thead><tr><th>AREA</th>{Array.from({ length: weekCount }, (_, week) => <th key={week} colSpan={3}>Week {week + 1}</th>)}</tr><tr><th>Category</th>{Array.from({ length: weekCount }, (_, week) => shifts.map((shift) => <th key={`${week}-${shift}`}>{shift}</th>))}</tr></thead><tbody>{areas.flatMap((area) => Array.from({ length: area.capacity }, (_, slotIndex) => <tr key={`${area.category}-${area.name}-${slotIndex}`} className={`category-tone-${area.categoryIndex % 7}`}><td>{area.name}{area.capacity > 1 && <small>Slot {slotIndex + 1}</small>}<small>{area.category}</small></td>{Array.from({ length: weekCount }, (_, week) => shifts.map((shift) => { const assignment = assignments.filter((item) => item.category === area.category && item.area === area.name && item.week === week + 1 && item.shift === shift).sort((left, right) => left.group.localeCompare(right.group, undefined, { numeric: true }))[slotIndex]; return <td key={`${week}-${shift}`}>{assignment?.group ?? '—'}</td> }))}</tr>))}</tbody></table></div></section>}
    <div className="schedule-meta"><span><i className="dot teal-dot" /> {isGenerated ? 'Schedule generated' : 'No schedule generated'}</span><span>Showing {matchingAssignments.length} of {assignments.length} assignments</span><span className="meta-right">Capacity is measured per area, week and shift</span></div>
    <section className="card schedule-table-card"><div className="table-scroll"><table className="schedule-table"><thead><tr><th className="category-col">Category / Area</th><th>AM <small>Morning</small></th><th>PM <small>Afternoon</small></th><th>NOC <small>Night</small></th><th className="capacity-col">Slot / max</th></tr></thead><tbody>{visibleSlots.map((area) => <tr key={`${area.category}-${area.name}-${area.slotIndex}`} className={`category-tone-${area.categoryIndex % 7}`}><td><div className="area-name"><span className="category-marker" /><div><strong>{area.name}</strong>{area.capacity > 1 && <small>Slot {area.slotIndex + 1}</small>}<small>{area.category}</small></div></div></td>{shifts.map((shift) => { const rows = getSlotAssignments(area, shift, area.slotIndex, matchingAssignments); return <td key={shift}><div className="assignment-list">{rows.map((assignment) => <button className="group-chip editable-chip" key={`${assignment.group}-${assignment.week}`} title={`Move ${assignment.group} in Week ${assignment.week} to the next shift`} onClick={() => updateAssignment(assignment.group, assignment.week, 'shift', shifts[(shifts.indexOf(assignment.shift) + 1) % shifts.length])}>{assignment.group}{selectedWeek === 0 ? ` · W${assignment.week}` : ''}</button>)}{!rows.length && <span className="empty-slot">—</span>}</div></td>})}<td><span className="capacity-badge">{area.slotIndex + 1} / {area.capacity}</span></td></tr>)}</tbody></table>{visibleAreas.length === 0 && <p className="tracking-empty">{assignments.length ? 'No assignments match the selected week, filters, or search.' : 'Generate a schedule to view assignments.'}</p>}</div><div className="table-footer"><span><strong>{new Set(matchingAssignments.map((assignment) => assignment.group)).size}</strong> of {groupCount} groups assigned in this view</span><span><strong>{visibleAreas.length}</strong> clinical areas shown</span></div></section>
  </>
}

function DashboardView({ groupCount, weekCount, categories, assignments, validationErrors, savedSchedules, generate, openSavedSchedules, openValidation, loadSchedule, onNavigate }: { groupCount: number; weekCount: number; categories: RotationCategory[]; assignments: Assignment[]; validationErrors: string[]; savedSchedules: SavedSchedule[]; generate: () => void; openSavedSchedules: () => void; openValidation: () => void; loadSchedule: (schedule: SavedSchedule) => void; onNavigate: (page: string) => void }) {
  const areas = categories.reduce((total, category) => total + category.areas.length, 0)
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())
  const byWeek = Array.from({ length: weekCount }, (_, index) => {
    const weekAssignments = assignments.filter((assignment) => assignment.week === index + 1)
    const assigned = new Set(weekAssignments.map((assignment) => assignment.group)).size
    return { week: index + 1, assigned, missing: Math.max(0, groupCount - assigned) }
  })
  const completed = assignments.length > 0 && validationErrors.length === 0

  return <>
    <div className="page-heading"><div><p className="eyebrow accent">{today.toUpperCase()}</p><h1>Rotation overview</h1><p className="subheading">Live status from your current schedule and configuration.</p></div><div className="heading-actions"><Button variant="outline" onClick={() => onNavigate('Schedule Setup')}><Settings2 data-icon="inline-start" /> Configure</Button><Button onClick={generate}><Sparkles data-icon="inline-start" /> Generate schedule</Button></div></div>
    <div className="stats-grid"><StatCard label="Student groups" value={String(groupCount)} detail="Configured groups" icon={Users} tone="teal" /><StatCard label="Categories" value={String(categories.length)} detail={`${areas} clinical areas`} icon={Hospital} tone="blue" /><StatCard label="Rotation weeks" value={String(weekCount)} detail="Configured period" icon={CalendarDays} tone="orange" /><StatCard label="Schedule status" value={assignments.length ? completed ? 'Valid' : 'Review' : 'Draft'} detail={assignments.length ? `${validationErrors.length} validation issues` : 'Awaiting generation'} icon={ClipboardCheck} tone="green" /></div>
    <div className="dashboard-grid"><section className="card schedule-overview"><div className="card-header"><div><h2>Weekly assignment coverage</h2><p>Assigned groups compared with the configured total</p></div><button className="text-button" onClick={() => onNavigate('Schedule')}>View schedule <ArrowRight /></button></div><div className="chart-area"><div className="y-axis"><span>{groupCount}</span><span>{Math.round(groupCount * .66)}</span><span>{Math.round(groupCount * .33)}</span><span>0</span></div><div className="bar-chart">{byWeek.map(({ week, assigned, missing }) => <div className="bar-column" key={week}><div className="bar-stack"><div className="bar teal" style={{ height: `${groupCount ? assigned / groupCount * 100 : 0}%` }} /><div className="bar pale" style={{ height: `${groupCount ? missing / groupCount * 100 : 0}%` }} /></div><span>W{week}</span></div>)}</div></div><div className="chart-legend"><span><i className="dot teal-dot" />Assigned</span><span><i className="dot pale-dot" />Unassigned</span></div></section><section className="card validation-card"><div className="card-header"><div><h2>Validation status</h2><p>Current schedule checks</p></div></div><div className="validation-score"><div className="score-ring"><span>{assignments.length ? Math.max(0, 100 - validationErrors.length) : 0}</span><small>%</small></div><div><strong>{!assignments.length ? 'Not generated' : completed ? 'All checks pass' : 'Review required'}</strong><p>{assignments.length ? `${validationErrors.length} findings` : 'Generate a schedule to validate.'}</p></div></div><div className="check-list">{(validationErrors.length ? validationErrors.slice(0, 4) : assignments.length ? ['All configured constraints pass.'] : ['Coverage checks', 'Area capacity checks', 'Category completion checks']).map((message) => <div className="check-row" key={message}><span className={`check ${validationErrors.length ? 'warning' : 'success'}`}>{validationErrors.length ? <AlertTriangle /> : <Check />}</span><span>{message}</span></div>)}</div><button className="full-button" onClick={openValidation}>Open validation report <ArrowRight /></button></section></div>
    <div className="bottom-grid"><section className="card recent-card"><div className="card-header"><div><h2>Recent schedules</h2><p>Saved on this device or synced to Supabase</p></div><button className="text-button" onClick={openSavedSchedules}>View all <ArrowRight /></button></div><div className="schedule-list">{savedSchedules.slice(0, 3).map((schedule) => <button className="schedule-row saved-row-button" key={schedule.id} onClick={() => loadSchedule(schedule)}><div className="file-icon"><FileText /></div><div><strong>{schedule.name}</strong><span>{new Date(schedule.createdAt).toLocaleString()} · {schedule.groupCount} groups</span></div><span className={`status-pill ${schedule.validationErrors.length ? 'archived' : 'ready'}`}>{schedule.validationErrors.length ? `${schedule.validationErrors.length} issues` : 'Valid'}</span></button>)}{!savedSchedules.length && <p className="tracking-empty">No saved schedules yet.</p>}</div></section><section className="card suggestions-card"><div className="card-header"><div><h2>Suggested fixes</h2><p>Current validation findings</p></div><span className="count-badge">{validationErrors.length}</span></div>{validationErrors.length ? validationErrors.slice(0, 3).map((error) => <div className="suggestion" key={error}><div className="suggestion-icon orange"><AlertTriangle /></div><div><strong>Resolve schedule issue</strong><p>{error}</p></div><button onClick={openValidation} aria-label="Open validation report"><ArrowRight /></button></div>) : <p className="suggestion-empty">{assignments.length ? 'No fixes needed.' : 'Generate a schedule to receive suggestions.'}</p>}</section></div>
  </>
}
