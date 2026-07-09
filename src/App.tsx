import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ArrowRight, ArrowLeft, Coffee, Moon, Sun, User, Settings, X, Save, AlertTriangle } from 'lucide-react';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

type AttendanceRecord = {
  date: string;
  timeIn: string;
  breakOut: string;
  breakIn: string;
  timeOut: string;
  remarks: string;
};

type EmployeeInfo = {
  name: string;
  position: string;
  id: string;
  payrollPeriod: string;
  discordWebhook?: string;
  discordUsername?: string;
  theme?: 'light' | 'dark' | 'system';
  workLocation?: string;
  autoSyncEnabled?: boolean;
};

type PunchType = 'timeIn' | 'breakOut' | 'breakIn' | 'timeOut';

function formatDisplayTime(timeStr: string) {
  if (!timeStr) return '--:--';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

const PUNCH_SCHEDULES = {
  timeIn: '9:00 AM',
  breakOut: '12:00 PM',
  breakIn: '1:00 PM',
  timeOut: '6:00 PM',
} as const;

const PUNCH_LABELS: Record<PunchType, string> = {
  timeIn: 'In',
  breakOut: 'Break Out',
  breakIn: 'Break In',
  timeOut: 'Out',
};

const WORK_TARGET_SECS = 8 * 3600;
const BREAK_LIMIT_SECS = 60 * 60;

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function getActivePunchType(record: AttendanceRecord): PunchType | null {
  if (!record.timeIn) return 'timeIn';
  if (!record.breakOut && !record.timeOut) return 'breakOut';
  if (record.breakOut && !record.breakIn && !record.timeOut) return 'breakIn';
  if (record.timeIn && !record.timeOut && (!record.breakOut || record.breakIn)) return 'timeOut';
  return null;
}

function normalizeTheme(theme?: EmployeeInfo['theme']): 'light' | 'dark' {
  return theme === 'dark' ? 'dark' : 'light';
}

function withDefaultTheme(info: Partial<EmployeeInfo>): EmployeeInfo {
  return { ...info, theme: normalizeTheme(info.theme) } as EmployeeInfo;
}

const PUNCH_TILE_CLASS: Record<PunchType, string> = {
  timeIn: 'punch-tile-in',
  breakOut: 'punch-tile-break-out',
  breakIn: 'punch-tile-break-in',
  timeOut: 'punch-tile-out',
};

export default function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});

  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo>({
    name: 'John Doe',
    position: 'Staff',
    id: '00000',
    payrollPeriod: '',
    discordWebhook: '',
    discordUsername: 'kimcastor6066',
    theme: 'light',
    workLocation: 'HOME',
    autoSyncEnabled: false
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [punchPromptOpen, setPunchPromptOpen] = useState(false);
  const [punchPromptType, setPunchPromptType] = useState<PunchType | null>(null);
  const [punchPromptTime, setPunchPromptTime] = useState('');
  const [punchPromptLocation, setPunchPromptLocation] = useState('');
  const [punchPromptReason, setPunchPromptReason] = useState('');
  const [confirmPunchType, setConfirmPunchType] = useState<PunchType | null>(null);
  const isTestMode = false;
  const [pendingSettings, setPendingSettings] = useState<EmployeeInfo | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = employeeInfo.theme === 'dark';
    root.classList.toggle('dark', isDark);
    setIsDarkTheme(isDark);
  }, [employeeInfo.theme]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isTestMode) {
      fetch('/test-data.json')
        .then(res => res.json())
        .then(data => {
          if (data.records) setRecords(data.records);
          if (data.employeeInfo) setEmployeeInfo(withDefaultTheme(data.employeeInfo));
        })
        .catch(err => console.error("Failed to load test data", err));
      return;
    }

    if (ipcRenderer) {
      ipcRenderer.invoke('read-data').then((data: Record<string, AttendanceRecord>) => {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setRecords(data);
        } else {
          setRecords({});
        }
      });

      ipcRenderer.invoke('read-settings').then((data: EmployeeInfo) => {
        if (data && data.name) {
          setEmployeeInfo(withDefaultTheme(data));
        }
      });
    } else {
      const localData = localStorage.getItem('attendance_records');
      if (localData) {
        setRecords(JSON.parse(localData));
      } else {
        setRecords({});
      }

      const localSettings = localStorage.getItem('attendance_settings');
      if (localSettings) {
        setEmployeeInfo(withDefaultTheme(JSON.parse(localSettings)));
      } else {
        setEmployeeInfo({
          name: '',
          position: '',
          id: '',
          payrollPeriod: '',
          discordWebhook: '',
          discordUsername: '',
          theme: 'light',
          workLocation: 'HOME',
          autoSyncEnabled: false
        });
      }
    }
  }, [isTestMode]);

  const saveRecords = (newRecords: Record<string, AttendanceRecord>) => {
    setRecords(newRecords);
    if (isTestMode) return;
    if (ipcRenderer) {
      ipcRenderer.invoke('write-data', newRecords);
    } else {
      localStorage.setItem('attendance_records', JSON.stringify(newRecords));
    }
  };

  const saveSettings = (newInfo: EmployeeInfo) => {
    const normalized = withDefaultTheme(newInfo);
    setEmployeeInfo(normalized);
    if (isTestMode) {
      setIsSettingsOpen(false);
      return;
    }
    if (ipcRenderer) {
      ipcRenderer.invoke('write-settings', normalized);
    } else {
      localStorage.setItem('attendance_settings', JSON.stringify(normalized));
    }
    setIsSettingsOpen(false);
  };

  const getTodayRecord = (): AttendanceRecord => {
    const todayStr = format(currentTime, 'd-MMM-yy');
    const yesterdayStr = format(new Date(currentTime.getTime() - 86400000), 'd-MMM-yy');

    const todayRecordObj = records[todayStr];
    const yesterdayRecordObj = records[yesterdayStr];

    if (!todayRecordObj?.timeIn && yesterdayRecordObj?.timeIn && !yesterdayRecordObj?.timeOut) {
      return yesterdayRecordObj;
    }

    return todayRecordObj || { date: todayStr, timeIn: '', breakOut: '', breakIn: '', timeOut: '', remarks: '' };
  };

  const handlePunch = (type: PunchType, customTime: string, location: string = '', reason: string = '') => {
    const timeStr = customTime || format(currentTime, 'HH:mm');
    const targetRecord = getTodayRecord();
    const newRecord = { ...targetRecord, [type]: timeStr };
    if (reason.trim()) {
      newRecord.remarks = newRecord.remarks ? `${newRecord.remarks} | ${reason.trim()}` : reason.trim();
    }
    const newRecords = { ...records, [targetRecord.date]: newRecord };
    saveRecords(newRecords);

    if (employeeInfo.discordWebhook) {
      const loc = location.trim() ? location.trim().toUpperCase() : (employeeInfo.workLocation || 'HOME');
      let message = '';
      const formattedReason = reason.trim() ? ` (${reason.trim().toUpperCase()})` : '';

      if (type === 'timeIn') message = `IN @ ${loc}${formattedReason}`;
      else if (type === 'timeOut') message = `OUT @ ${loc}${formattedReason}`;
      else if (type === 'breakOut') message = `BREAK OUT @ ${loc}${formattedReason}`;
      else if (type === 'breakIn') message = `BREAK IN @ ${loc}${formattedReason}`;

      if (message) {
        fetch(employeeInfo.discordWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `🕒 **${employeeInfo.name || 'User'}**: ${message} (${timeStr})` })
        }).catch(err => console.error('Discord webhook failed', err));
      }
    }
  };

  const openPunchPrompt = (type: PunchType) => {
    setPunchPromptType(type);
    setPunchPromptTime('');
    setPunchPromptLocation(employeeInfo.workLocation || 'HOME');
    setPunchPromptReason('');
    setPunchPromptOpen(true);
  };

  const todayRecord = getTodayRecord();
  const activePunch = getActivePunchType(todayRecord);
  const onBreak = !!todayRecord.breakOut && !todayRecord.breakIn && !todayRecord.timeOut;

  const requestPunch = (type: PunchType) => {
    if (activePunch === type) {
      openPunchPrompt(type);
    } else {
      setConfirmPunchType(type);
    }
  };

  const computeBreakSeconds = () => {
    const bOutStr = todayRecord.breakOut;
    if (!bOutStr) return 0;

    const bOutDate = new Date(currentTime);
    const [bOutH, bOutM] = bOutStr.split(':').map(Number);
    bOutDate.setHours(bOutH, bOutM, 0, 0);

    let bInDate = new Date(currentTime);
    if (todayRecord.breakIn) {
      const [bInH, bInM] = todayRecord.breakIn.split(':').map(Number);
      bInDate.setHours(bInH, bInM, 0, 0);
    } else if (todayRecord.timeOut) {
      const [outH, outM] = todayRecord.timeOut.split(':').map(Number);
      bInDate.setHours(outH, outM, 0, 0);
    }

    let breakSecs = Math.floor((bInDate.getTime() - bOutDate.getTime()) / 1000);
    if (breakSecs < 0) breakSecs += 24 * 3600;
    return Math.max(0, breakSecs);
  };

  const computeTodayWorkSeconds = () => {
    const tInStr = todayRecord.timeIn;
    if (!tInStr) return 0;

    const tInDate = new Date(currentTime);
    const [inH, inM] = tInStr.split(':').map(Number);
    tInDate.setHours(inH, inM, 0, 0);

    let tOutDate = new Date(currentTime);
    if (todayRecord.timeOut) {
      const [outH, outM] = todayRecord.timeOut.split(':').map(Number);
      tOutDate.setHours(outH, outM, 0, 0);
    }

    let officeSecs = Math.floor((tOutDate.getTime() - tInDate.getTime()) / 1000);
    if (officeSecs < 0) officeSecs += 24 * 3600;

    return Math.max(0, officeSecs - computeBreakSeconds());
  };

  const computeTodayWork = () => {
    const totalSecs = computeTodayWorkSeconds();
    if (totalSecs <= 0) return '0:00:00';
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const workSecs = computeTodayWorkSeconds();
  const breakSecs = computeBreakSeconds();
  const workRemaining = Math.max(0, WORK_TARGET_SECS - workSecs);
  const workOvertime = Math.max(0, workSecs - WORK_TARGET_SECS);
  const breakRemaining = Math.max(0, BREAK_LIMIT_SECS - breakSecs);
  const breakOvertime = Math.max(0, breakSecs - BREAK_LIMIT_SECS);

  const toggleTheme = () => {
    const newTheme = isDarkTheme ? 'light' : 'dark';
    saveSettings({ ...employeeInfo, theme: newTheme });
  };

  return (
    <div className="vintage-page min-h-screen text-[#2A3B4C] dark:text-[#F5EAD9] font-sans selection:bg-[#F3D2B5] selection:text-[#2A3B4C] safe-bottom">

      {/* Punch Modal */}
      {punchPromptOpen && punchPromptType && (
        <div className="vintage-modal-overlay">
          <div className="vintage-modal p-6 animate-in fade-in zoom-in-95 duration-200">
            <p className="vintage-eyebrow mb-1">Confirm Punch</p>
            <h3 className="vintage-modal-title text-xl mb-1">Adjust Time</h3>
            <p className="text-sm vintage-muted-text mb-5">Set the time if you forgot to punch earlier.</p>

            <label className="vintage-eyebrow block mb-1.5">Time</label>
            <input
              autoFocus={punchPromptType !== 'breakOut'}
              type="time"
              value={punchPromptTime}
              onChange={e => setPunchPromptTime(e.target.value)}
              className="vintage-input mb-4 font-mono"
            />

            <label className="vintage-eyebrow block mb-1.5">Location</label>
            <input
              type="text"
              value={punchPromptLocation}
              onChange={e => setPunchPromptLocation(e.target.value)}
              className="vintage-input mb-4"
              placeholder="e.g. HOME, TRANCO OFFICE"
            />

            <label className="vintage-eyebrow block mb-1.5">Reason (Optional)</label>
            <textarea
              rows={1}
              autoFocus={punchPromptType === 'breakOut'}
              value={punchPromptReason}
              onChange={e => {
                setPunchPromptReason(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handlePunch(punchPromptType, punchPromptTime, punchPromptLocation, punchPromptReason);
                  setPunchPromptOpen(false);
                }
              }}
              className="vintage-input mb-6 resize-none overflow-hidden"
              placeholder="e.g. LUNCH, BROWNOUT"
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setPunchPromptOpen(false)} className="vintage-btn-ghost">Cancel</button>
              <button
                onClick={() => {
                  handlePunch(punchPromptType, punchPromptTime, punchPromptLocation, punchPromptReason);
                  setPunchPromptOpen(false);
                }}
                className="vintage-btn-primary"
              >
                Confirm Punch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="vintage-modal-overlay">
          <div className="vintage-modal max-h-[90dvh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="vintage-modal-header">
              <div>
                <p className="vintage-eyebrow mb-0.5">Preferences</p>
                <h3 className="vintage-modal-title text-lg flex items-center gap-2">
                  <Settings size={18} className="text-[#D97A44]" /> Settings
                </h3>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="vintage-icon-btn w-9 h-9">
                <X size={16} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                setPendingSettings({
                  name: formData.get('name') as string,
                  position: formData.get('position') as string,
                  id: formData.get('id') as string,
                  payrollPeriod: '',
                  discordWebhook: formData.get('discordWebhook') as string,
                  theme: employeeInfo.theme,
                  workLocation: (formData.get('workLocation') as string) || 'HOME',
                });
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="vintage-settings-scroll flex flex-col gap-6">
                <div>
                  <h4 className="vintage-section-title">
                    <User size={15} className="text-[#D97A44]" /> Personal Details
                  </h4>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="vintage-label">Full Name <span className="text-[#D97A44]">*</span></label>
                      <input name="name" defaultValue={employeeInfo.name} required className="vintage-input" />
                    </div>
                    <div>
                      <label className="vintage-label">Position <span className="text-[#D97A44]">*</span></label>
                      <input name="position" defaultValue={employeeInfo.position} required className="vintage-input" />
                    </div>
                    <div>
                      <label className="vintage-label">Employee ID No. <span className="text-[#D97A44]">*</span></label>
                      <input name="id" defaultValue={employeeInfo.id} required className="vintage-input" />
                    </div>
                    <div>
                      <label className="vintage-label">Default Work Location <span className="text-[#D97A44]">*</span></label>
                      <input name="workLocation" defaultValue={employeeInfo.workLocation?.trim() || 'HOME'} placeholder="HOME" required className="vintage-input" />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="vintage-section-title">Discord Integration</h4>
                  <div>
                    <label className="vintage-label">Discord Webhook URL</label>
                    <input name="discordWebhook" type="url" defaultValue={employeeInfo.discordWebhook} placeholder="https://discord.com/api/webhooks/..." className="vintage-input text-sm" />
                    <p className="text-xs vintage-muted-text mt-2">Punches will be sent to your Discord channel.</p>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6 pt-4 flex justify-end shrink-0">
                <button type="submit" className="vintage-btn-primary flex items-center gap-2">
                  <Save size={16} /> Save Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Out-of-Sequence Punch Confirm Modal */}
      {confirmPunchType && (
        <div className="vintage-modal-overlay z-[60]">
          <div className="vintage-modal p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-[#F3D2B5] text-[#D97A44] rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={22} />
            </div>
            <h3 className="vintage-modal-title text-lg mb-2">Out of Sequence</h3>
            <p className="vintage-muted-text text-sm mb-6">
              You&apos;re about to record <strong>{PUNCH_LABELS[confirmPunchType]}</strong>, but it&apos;s not the expected next step. Continue?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmPunchType(null)} className="vintage-btn-ghost">Cancel</button>
              <button
                onClick={() => {
                  openPunchPrompt(confirmPunchType);
                  setConfirmPunchType(null);
                }}
                className="vintage-btn-primary"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Confirm Modal */}
      {pendingSettings && (
        <div className="vintage-modal-overlay z-[60]">
          <div className="vintage-modal p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-[#F3D2B5] text-[#D97A44] rounded-full flex items-center justify-center mx-auto mb-4">
              <Save size={22} />
            </div>
            <h3 className="vintage-modal-title text-lg mb-2">Save Details?</h3>
            <p className="vintage-muted-text text-sm mb-6">Are you sure you want to save these changes?</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setPendingSettings(null)} className="vintage-btn-ghost">Cancel</button>
              <button
                onClick={() => {
                  if (pendingSettings) {
                    saveSettings(pendingSettings);
                    setPendingSettings(null);
                  }
                }}
                className="vintage-btn-primary"
              >
                Confirm Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="w-full min-h-screen flex flex-col gap-6 px-5 pt-8 pb-4 md:max-w-sm md:mx-auto">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <p className="vintage-eyebrow">{format(currentTime, 'EEEE, MMM d')}</p>
              <h1 className="text-[2.75rem] leading-none font-extrabold text-[#2A3B4C] dark:text-[#F5EAD9] tracking-tight mt-1 tabular-nums">
                {format(currentTime, 'h:mm a')}
              </h1>
              <p className="text-sm text-[#8A7F72] mt-2 font-medium">
                {employeeInfo.name || 'Set your name'} · {employeeInfo.position || 'Staff'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="vintage-icon-btn"
                title={isDarkTheme ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="vintage-icon-btn"
                title="Settings"
              >
                <Settings size={18} />
              </button>
            </div>
          </div>

          {/* Section label */}
          <div>
            <p className="vintage-eyebrow mb-1">Today's Focus</p>
            <h2 className="text-2xl font-bold text-[#2A3B4C] dark:text-[#F5EAD9] tracking-tight">Time Clock</h2>
          </div>

          {/* Work Today stat */}
          {todayRecord.timeIn && (
            <div className="vintage-stat-strip flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="vintage-eyebrow">Total Work Today</span>
                <span className="text-2xl font-extrabold font-mono text-[#F5EAD9] tabular-nums">{computeTodayWork()}</span>
              </div>
              <div className="border-t border-[#F5EAD9]/15 pt-2 flex flex-col gap-1">
                {workSecs < WORK_TARGET_SECS ? (
                  <p className="text-sm font-semibold text-red-600 tabular-nums">
                    {formatDuration(workRemaining)} left to reach 8h
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-[#2F5C3F] tabular-nums">
                    8h reached (+{formatDuration(workOvertime)})
                  </p>
                )}
                {onBreak && (
                  breakSecs < BREAK_LIMIT_SECS ? (
                    <p className="text-sm font-semibold text-[#D97A44] tabular-nums">
                      Break: {formatDuration(breakRemaining)} left
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-red-600 tabular-nums">
                      Break over by {formatDuration(breakOvertime)}
                    </p>
                  )
                )}
              </div>
            </div>
          )}

          {/* Punch grid */}
          <div className="grid grid-cols-2 gap-3 flex-1 content-start">
            <PunchButton
              variant="timeIn"
              title="In"
              schedule={PUNCH_SCHEDULES.timeIn}
              time={todayRecord.timeIn}
              onClick={() => requestPunch('timeIn')}
              isActive={activePunch === 'timeIn'}
              isCompleted={!!todayRecord.timeIn}
              icon={<ArrowRight size={22} strokeWidth={2.5} />}
            />
            <PunchButton
              variant="breakOut"
              title="Break Out"
              schedule={PUNCH_SCHEDULES.breakOut}
              time={todayRecord.breakOut}
              onClick={() => requestPunch('breakOut')}
              isActive={activePunch === 'breakOut'}
              isCompleted={!!todayRecord.breakOut}
              icon={<Coffee size={22} strokeWidth={2.5} />}
            />
            <PunchButton
              variant="breakIn"
              title="Break In"
              schedule={PUNCH_SCHEDULES.breakIn}
              time={todayRecord.breakIn}
              onClick={() => requestPunch('breakIn')}
              isActive={activePunch === 'breakIn'}
              isCompleted={!!todayRecord.breakIn}
              icon={<ArrowLeft size={22} strokeWidth={2.5} />}
            />
            <PunchButton
              variant="timeOut"
              title="Out"
              schedule={PUNCH_SCHEDULES.timeOut}
              time={todayRecord.timeOut}
              onClick={() => requestPunch('timeOut')}
              isActive={activePunch === 'timeOut'}
              isCompleted={!!todayRecord.timeOut}
              icon={<ArrowLeft size={22} strokeWidth={2.5} />}
            />
          </div>

        <footer className="mt-auto py-4 text-center text-[10px] font-semibold tracking-wide text-[#8A7F72] uppercase">
        Developed by <span className="text-[#2A3B4C] dark:text-[#F5EAD9] normal-case font-bold">Kim Castor</span> and Fork by <span className="text-[#2A3B4C] dark:text-[#F5EAD9] normal-case font-bold">VannyCon</span>
        </footer>
      </main>
    </div>
  );
}

function PunchButton({ variant, title, schedule, time, onClick, isActive, isCompleted, icon }: {
  variant: PunchType;
  title: string;
  schedule: string;
  time: string;
  onClick: () => void;
  isActive: boolean;
  isCompleted: boolean;
  icon: React.ReactNode;
}) {
  const stateClass = isActive
    ? 'punch-tile-active'
    : isCompleted
      ? 'punch-tile-completed'
      : 'punch-tile-muted';

  return (
    <button
      onClick={onClick}
      className={`punch-tile ${PUNCH_TILE_CLASS[variant]} ${stateClass}`}
    >
      <div className="punch-tile-icon-badge">{icon}</div>
      <span className="font-bold text-sm mb-0.5">{title}</span>
      <span className="vintage-eyebrow mb-2">Schedule {schedule}</span>
      <span className="text-lg font-extrabold tabular-nums">{formatDisplayTime(time)}</span>
    </button>
  );
}
