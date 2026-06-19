import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Upload, Trash2, CalendarPlus, Clock, Download, ArrowRight, ArrowLeft, Coffee, Briefcase, Moon, Sun, User, Calendar, Settings, X, Save } from 'lucide-react';

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
  alarmEnabled?: boolean;
  alarmHours?: number;
  discordWebhook?: string;
  theme?: 'light' | 'dark' | 'system';
};

// Helper for UI computation
function parseTime(timeStr: string) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function formatMinutes(mins: number) {
  if (mins <= 0) return '0:00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export default function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});

  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo>({
    name: 'John Doe',
    position: 'Staff',
    id: '00000',
    payrollPeriod: '',
    alarmEnabled: true,
    alarmHours: 8,
    discordWebhook: '',
    theme: 'dark'
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [punchPromptOpen, setPunchPromptOpen] = useState(false);
  const [punchPromptType, setPunchPromptType] = useState<'timeIn' | 'breakOut' | 'breakIn' | 'timeOut' | null>(null);
  const [punchPromptTime, setPunchPromptTime] = useState('');
  const [punchPromptReason, setPunchPromptReason] = useState('');
  const [tableTab, setTableTab] = useState<'all' | 'leaves'>('all');
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveDateInput, setLeaveDateInput] = useState('');
  const [leaveRemarkInput, setLeaveRemarkInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportBackup = () => {
    const backupData = {
      records,
      employeeInfo
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.records) saveRecords(data.records);
        if (data.employeeInfo) {
           setEmployeeInfo(data.employeeInfo);
           if (ipcRenderer) ipcRenderer.invoke('write-settings', data.employeeInfo);
        }
        alert('Backup imported successfully!');
        setIsSettingsOpen(false);
      } catch (error) {
        alert('Invalid backup file format.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    const root = window.document.documentElement;
    let isDark = false;
    if (employeeInfo.theme === 'system' || !employeeInfo.theme) {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      isDark = systemTheme === 'dark';
    } else {
      isDark = employeeInfo.theme === 'dark';
    }
    root.classList.toggle('dark', isDark);
    setIsDarkTheme(isDark);
  }, [employeeInfo.theme]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const [filterMode, setFilterMode] = useState<'range' | 'month'>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [monthFilter, setMonthFilter] = useState(format(new Date(), 'yyyy-MM'));

  const [previewRecords, setPreviewRecords] = useState<Record<string, AttendanceRecord>>({});

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
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
          setEmployeeInfo(data);
        }
      });
    }
  }, []);

  const saveRecords = (newRecords: Record<string, AttendanceRecord>) => {
    setRecords(newRecords);
    if (ipcRenderer) ipcRenderer.invoke('write-data', newRecords);
  };

  const saveSettings = (newInfo: EmployeeInfo) => {
    setEmployeeInfo(newInfo);
    if (ipcRenderer) ipcRenderer.invoke('write-settings', newInfo);
    setIsSettingsOpen(false);
  };

  const todayStr = format(currentTime, 'd-MMM-yy');

  const getTodayRecord = (): AttendanceRecord => {
    return records[todayStr] || { date: todayStr, timeIn: '', breakOut: '', breakIn: '', timeOut: '', remarks: '' };
  };

  const handlePunch = (type: 'timeIn' | 'breakOut' | 'breakIn' | 'timeOut', customTime: string, reason: string = '') => {
    const timeStr = customTime || format(currentTime, 'HH:mm');
    const newRecord = { ...getTodayRecord(), [type]: timeStr };
    const newRecords = { ...records, [todayStr]: newRecord };
    saveRecords(newRecords);

    // Discord Webhook Integration
    if (employeeInfo.discordWebhook) {
      let message = '';
      if (type === 'timeIn') message = 'IN @ HOME';
      else if (type === 'timeOut') message = 'OUT @ HOME';
      else if (type === 'breakOut') {
        message = reason.trim() ? `BREAK OUT @ HOME (${reason.trim().toUpperCase()})` : 'BREAK OUT @ HOME';
      }
      else if (type === 'breakIn') message = 'BREAK IN @ HOME';

      if (message) {
        fetch(employeeInfo.discordWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `🕒 **${employeeInfo.name || 'User'}**: ${message} (${timeStr})` })
        }).catch(err => console.error('Discord webhook failed', err));
      }
    }
  };

  const handlePreviewEdit = (date: string, field: keyof AttendanceRecord, value: string) => {
    const record = previewRecords[date] || { date, timeIn: '', breakOut: '', breakIn: '', timeOut: '', remarks: '' };
    setPreviewRecords({ ...previewRecords, [date]: { ...record, [field]: value } });
  };

  const todayRecord = getTodayRecord();

  const [alarmTriggered, setAlarmTriggered] = useState(false);

  const computeTodayWorkMins = () => {
    const tIn = parseTime(todayRecord.timeIn);
    if (tIn === null) return 0;

    let tOut = parseTime(todayRecord.timeOut);
    if (tOut === null) {
      tOut = parseTime(format(currentTime, 'HH:mm'));
    }

    let officeMins = 0;
    if (tOut !== null) officeMins = tOut - tIn;

    let breakMins = 0;
    const bOut = parseTime(todayRecord.breakOut);
    if (bOut !== null) {
      let bIn = parseTime(todayRecord.breakIn);
      if (bIn === null && !todayRecord.timeOut) {
        bIn = parseTime(format(currentTime, 'HH:mm'));
      }
      if (bIn !== null) {
        breakMins = bIn - bOut;
      }
    }

    return Math.max(0, officeMins - breakMins);
  };

  const computeTodayWork = () => {
    return formatMinutes(computeTodayWorkMins());
  };

  useEffect(() => {
    // Request notification permission on startup
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (employeeInfo.alarmEnabled === false) {
      setAlarmTriggered(false);
      return;
    }

    const workMins = computeTodayWorkMins();
    const targetMins = (employeeInfo.alarmHours || 8) * 60;
    
    // Check if target hours is reached
    if (workMins >= targetMins && !alarmTriggered && !todayRecord.timeOut) {
      // Trigger System Beep (3 times)
      if (window.require) {
        const { shell } = window.require('electron');
        shell.beep();
        setTimeout(() => shell.beep(), 600);
        setTimeout(() => shell.beep(), 1200);
      }

      // Show Desktop Notification
      if (Notification.permission === "granted") {
        new Notification("Shift Complete! 🎉", {
          body: `You have reached exactly ${employeeInfo.alarmHours || 8} hours of work today. Don't forget to Time Out!`
        });
      }

      setAlarmTriggered(true);
    } else if (workMins < targetMins && alarmTriggered) {
      // Reset if edited to below target hours or a new day
      setAlarmTriggered(false);
    }
  }, [currentTime, todayRecord, alarmTriggered, employeeInfo.alarmEnabled, employeeInfo.alarmHours]);

  const PH_HOLIDAYS: Record<string, string> = {
    '01-01': "New Year's Day",
    '02-25': "EDSA Revolution Anniversary",
    '04-09': "Araw ng Kagitingan",
    '05-01': "Labor Day",
    '06-12': "Independence Day",
    '08-21': "Ninoy Aquino Day",
    '08-31': "National Heroes Day",
    '11-01': "All Saints' Day",
    '11-30': "Bonifacio Day",
    '12-08': "Immaculate Conception",
    '12-25': "Christmas Day",
    '12-30': "Rizal Day",
    '12-31': "New Year's Eve"
  };

  const MOVABLE_HOLIDAYS_2026: Record<string, string> = {
    '2026-04-02': "Maundy Thursday",
    '2026-04-03': "Good Friday"
  };

  const getHoliday = (date: Date): string => {
    const monthDay = format(date, 'MM-dd');
    if (PH_HOLIDAYS[monthDay]) return PH_HOLIDAYS[monthDay];
    
    const fullDate = format(date, 'yyyy-MM-dd');
    if (MOVABLE_HOLIDAYS_2026[fullDate]) return MOVABLE_HOLIDAYS_2026[fullDate];

    return '';
  };

  // Used for filtering the preview specifically
  const getFilteredList = (sourceRecords: Record<string, AttendanceRecord>) => {
    let targetDays: Date[] = [];
    
    if (filterMode === 'month') {
      if (monthFilter) {
        const [year, month] = monthFilter.split('-');
        
        // Generate all days in this month
        const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
          targetDays.push(new Date(parseInt(year), parseInt(month) - 1, i));
        }
      }
    } else {
      if (startDate && endDate) {
        const s = new Date(startDate);
        const e = new Date(endDate);
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          targetDays.push(new Date(d));
        }
      }
    }

    // Fallback: if no valid range is generated, just use the dates that exist in the records
    if (targetDays.length === 0) {
      targetDays = Object.values(sourceRecords).map(r => new Date(r.date));
    }

    // Deduplicate and map
    const uniqueMap = new Map<string, AttendanceRecord>();
    
    targetDays.forEach(d => {
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const dateStr = format(d, 'd-MMM-yy');
      const existing = sourceRecords[dateStr];
      
      // If it's a weekend and there's no explicit record, do NOT add it to the view.
      if (isWeekend && !existing) {
        return;
      }
      
      let remarks = existing?.remarks || '';
      
      // Auto-detect holiday if remarks are empty
      if (!remarks) {
        const holiday = getHoliday(d);
        if (holiday) remarks = holiday;
      }

      uniqueMap.set(dateStr, {
        date: dateStr,
        timeIn: existing?.timeIn || '',
        breakOut: existing?.breakOut || '',
        breakIn: existing?.breakIn || '',
        timeOut: existing?.timeOut || '',
        remarks
      });
    });

    return Array.from(uniqueMap.values())
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const filteredRecordsList = getFilteredList(records);
  const filteredPreviewList = getFilteredList(previewRecords);
  
  const recordsToDisplay = filteredRecordsList.filter(r => {
    if (tableTab === 'all') return true;
    return r.remarks && (r.remarks.toLowerCase().includes('leave') || r.remarks.toLowerCase().includes('holiday') || getHoliday(new Date(r.date)));
  });

  const handleOpenPreview = () => {
    setPreviewRecords(records);
    setIsPreviewOpen(true);
  };

  const handleConfirmExport = () => {
    // Save any changes made in preview back to the main DB
    saveRecords(previewRecords);

    if (ipcRenderer) {
      const filteredDict: Record<string, AttendanceRecord> = {};
      filteredPreviewList.forEach(r => filteredDict[r.date] = r);
      
      let computedPeriod = "All Records";
      
      if (filterMode === 'month' && monthFilter) {
        const [year, month] = monthFilter.split('-');
        computedPeriod = format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMMM yyyy');
      } else if (filterMode === 'range') {
        if (startDate && endDate) {
          computedPeriod = `${format(new Date(startDate), 'MMMM d, yyyy')} to ${format(new Date(endDate), 'MMMM d, yyyy')}`;
        } else if (startDate) {
          computedPeriod = `From ${format(new Date(startDate), 'MMMM d, yyyy')}`;
        } else if (endDate) {
          computedPeriod = `Up to ${format(new Date(endDate), 'MMMM d, yyyy')}`;
        }
      }
      
      const infoToExport = { ...employeeInfo, payrollPeriod: computedPeriod };
      ipcRenderer.invoke('export-excel', filteredDict, infoToExport);
    }
    setIsPreviewOpen(false);
  };

  return (
    <div className="min-h-screen relative text-zinc-800 dark:text-zinc-200 font-sans selection:bg-blue-100 selection:text-blue-900">
      <div className="liquid-bg"></div>
      {/* Top Navbar */}
      <header className="bg-white/60 dark:bg-black/40 backdrop-blur-3xl border-b border-zinc-200/50 dark:border-white/5 px-8 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl shadow-md dark:shadow-none shadow-blue-200 overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 flex items-center justify-center w-14 h-14 shrink-0">
            <img src="./icon.png" alt="ClockedIn Logo" className="w-full h-full object-cover scale-[1.15]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white leading-tight tracking-tight">ClockedIn</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 font-semibold tracking-wide uppercase mt-0.5">Time & Attendance</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-zinc-900 dark:text-white">{employeeInfo.name}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{employeeInfo.position} • ID: {employeeInfo.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newTheme = isDarkTheme ? 'light' : 'dark';
                saveSettings({ ...employeeInfo, theme: newTheme });
              }}
              className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full flex items-center justify-center border border-zinc-200/50 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400 transition-colors shadow-sm dark:shadow-none cursor-pointer"
              title={isDarkTheme ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkTheme ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full flex items-center justify-center border border-zinc-200/50 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400 transition-colors shadow-sm dark:shadow-none cursor-pointer"
              title="Edit Information"
            >
              <User size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Universal Punch Modal */}
      {punchPromptOpen && punchPromptType && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/70 dark:bg-[#0a0a0a]/60 backdrop-blur-3xl rounded-3xl shadow-xl border border-zinc-200/50 dark:border-white/5 w-full max-w-sm overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white mb-2">Confirm Punch Time</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Adjust the time if you forgot to punch earlier.</p>
            
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 uppercase tracking-wider">Time</label>
            <input 
              autoFocus={punchPromptType !== 'breakOut'}
              type="time" 
              value={punchPromptTime}
              onChange={e => setPunchPromptTime(e.target.value)}
              className="w-full bg-white dark:bg-black/50 border border-zinc-200/50 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 mb-4 text-sm font-mono"
            />

            {punchPromptType === 'breakOut' && (
              <>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 uppercase tracking-wider">Reason (Optional)</label>
                <input 
                  autoFocus
                  type="text" 
                  value={punchPromptReason}
                  onChange={e => setPunchPromptReason(e.target.value)}
                  onKeyDown={e => {
                     if (e.key === 'Enter') {
                        handlePunch(punchPromptType, punchPromptTime, punchPromptReason);
                        setPunchPromptOpen(false);
                     }
                  }}
                  className="w-full bg-white dark:bg-black/50 border border-zinc-200/50 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 mb-6 text-sm"
                  placeholder="e.g. BROWNOUT, LUNCH"
                />
              </>
            )}

            <div className="flex justify-end gap-3 mt-2">
              <button onClick={() => setPunchPromptOpen(false)} className="px-4 py-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors font-medium text-sm">Cancel</button>
              <button onClick={() => {
                handlePunch(punchPromptType, punchPromptTime, punchPromptReason);
                setPunchPromptOpen(false);
              }} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-medium text-sm shadow-sm">Confirm Punch</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/70 dark:bg-[#0a0a0a]/60 backdrop-blur-3xl rounded-xl shadow-xl dark:shadow-2xl dark:shadow-black/50 w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/30">
              <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={18} className="text-blue-600 dark:text-blue-400" /> Settings & Preferences</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:text-zinc-500"><X size={20} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              saveSettings({
                name: formData.get('name') as string,
                position: formData.get('position') as string,
                id: formData.get('id') as string,
                payrollPeriod: '', // We don't save this anymore, it's computed dynamically
                alarmEnabled: formData.get('alarmEnabled') === 'on',
                alarmHours: Number(formData.get('alarmHours')) || 8,
                discordWebhook: formData.get('discordWebhook') as string,
                theme: formData.get('theme') as 'light' | 'dark' | 'system',
              });
            }} className="p-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Personal Info */}
                <div className="flex flex-col gap-4">
                  <h4 className="font-bold text-zinc-800 dark:text-zinc-200 text-sm flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2"><User size={16} className="text-blue-500 dark:text-blue-400"/> Personal Details</h4>
                  
                  <div>
                    <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Full Name</label>
                    <input name="name" defaultValue={employeeInfo.name} required className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none bg-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Position</label>
                    <input name="position" defaultValue={employeeInfo.position} required className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none bg-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Employee ID No.</label>
                    <input name="id" defaultValue={employeeInfo.id} required className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none bg-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>

                {/* Right Column: Integrations & Alarms */}
                <div className="flex flex-col gap-6">
                  
                  {/* Alarm Settings */}
                  <div className="flex flex-col gap-4">
                    <h4 className="font-bold text-zinc-800 dark:text-zinc-200 text-sm flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2"><Clock size={16} className="text-blue-500 dark:text-blue-400"/> Alarm Settings</h4>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">Enable Shift Alarm</label>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 dark:text-zinc-500">Play a sound and notification when shift is complete.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="alarmEnabled" defaultChecked={employeeInfo.alarmEnabled !== false} className="sr-only peer" />
                        <div className="w-11 h-6 bg-zinc-200 dark:bg-zinc-700 peer-focus:outline-none bg-transparent rounded-full peer peer-checked:after:tranzinc-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-zinc-900 after:border-zinc-300 dark:border-zinc-700 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Target Work Hours</label>
                      <input type="number" name="alarmHours" min="1" max="24" step="0.5" defaultValue={employeeInfo.alarmHours || 8} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none bg-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>

                  {/* Discord */}
                  <div className="flex flex-col gap-4">
                    <h4 className="font-bold text-zinc-800 dark:text-zinc-200 text-sm flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2">💬 Discord Integration</h4>
                    <div>
                      <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Discord Webhook URL (Optional)</label>
                      <input name="discordWebhook" type="url" defaultValue={employeeInfo.discordWebhook} placeholder="https://discord.com/api/webhooks/..." className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none bg-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm" />
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 mt-1">If provided, punches (Time In, Time Out, etc.) will be automatically sent to your Discord channel.</p>
                    </div>
                  </div>

                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-4">
                
                {/* Backup & Import */}
                <div className="flex flex-col sm:flex-row gap-3 border border-zinc-200/50 dark:border-zinc-800 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 justify-between items-center">
                  <div className="text-sm">
                    <p className="font-bold text-zinc-800 dark:text-zinc-200">Data Management</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Backup your data as a JSON file, or restore from a previous backup.</p>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                      type="button" 
                      onClick={handleExportBackup}
                      className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
                    >
                      <Download size={14} /> Backup Data
                    </button>
                    
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
                    >
                      <Upload size={14} /> Import JSON
                    </button>
                    <input 
                      type="file" 
                      accept=".json" 
                      ref={fileInputRef} 
                      onChange={handleImportBackup} 
                      className="hidden" 
                    />
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-between items-center">
                  <button 
                    type="button" 
                    onClick={() => setIsResetConfirmOpen(true)}
                    className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-sm"
                  >
                    Reset Database
                  </button>
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-sm dark:shadow-none transition-colors">
                    <Save size={18} /> Save Details
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-white/70 dark:bg-[#0a0a0a]/80 backdrop-blur-3xl rounded-3xl shadow-2xl border border-red-500/20 dark:border-red-500/10 w-full max-w-sm overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-bold text-lg text-red-600 dark:text-red-400 mb-2">Delete All Data?</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">Are you absolutely sure you want to wipe the database? This action cannot be undone and you will lose all attendance history.</p>
            
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsResetConfirmOpen(false)} className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors font-medium text-sm">Cancel</button>
              <button onClick={() => {
                saveRecords({});
                setIsResetConfirmOpen(false);
                setIsSettingsOpen(false);
              }} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors font-bold text-sm shadow-sm shadow-red-600/20">Yes, Wipe Database</button>
            </div>
          </div>
        </div>
      )}



      {/* Delete Confirmation Modal */}
      {recordToDelete && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white/70 dark:bg-[#0a0a0a]/60 backdrop-blur-3xl rounded-3xl shadow-xl border border-zinc-200/50 dark:border-white/5 w-full max-w-sm overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white mb-2">Delete Record?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Are you sure you want to permanently delete the attendance record for <strong>{recordToDelete}</strong>?</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setRecordToDelete(null)}
                className="px-4 py-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (recordToDelete) {
                    const newRecords = { ...records };
                    delete newRecords[recordToDelete];
                    saveRecords(newRecords);
                    setRecordToDelete(null);
                  }
                }}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors font-bold text-sm shadow-sm"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Future Leave Modal */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white/70 dark:bg-[#0a0a0a]/60 backdrop-blur-3xl rounded-3xl shadow-xl border border-zinc-200/50 dark:border-white/5 w-full max-w-sm overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white mb-2">Add Future Leave</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Mark a future date as Leave, Absent, or Holiday.</p>
            
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 uppercase tracking-wider">Date</label>
            <input 
              type="date" 
              value={leaveDateInput}
              onChange={e => setLeaveDateInput(e.target.value)}
              className="w-full bg-white dark:bg-black/50 border border-zinc-200/50 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 mb-4 text-sm font-mono"
            />

            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 uppercase tracking-wider">Leave Type / Remark</label>
            <input 
              type="text" 
              value={leaveRemarkInput}
              onChange={e => setLeaveRemarkInput(e.target.value)}
              className="w-full bg-white dark:bg-black/50 border border-zinc-200/50 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 mb-6 text-sm"
              placeholder="e.g. Vacation Leave, Sick Leave"
            />

            <div className="flex justify-end gap-3 mt-2">
              <button onClick={() => setIsLeaveModalOpen(false)} className="px-4 py-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors font-medium text-sm">Cancel</button>
              <button onClick={() => {
                if (!leaveDateInput) return;
                const dateKey = format(new Date(leaveDateInput), 'd-MMM-yy');
                const newRecords = { ...records };
                if (!newRecords[dateKey]) {
                  newRecords[dateKey] = {
                    date: dateKey,
                    timeIn: '', timeOut: '', breakOut: '', breakIn: '',
                    remarks: leaveRemarkInput
                  };
                } else {
                  newRecords[dateKey].remarks = leaveRemarkInput;
                }
                saveRecords(newRecords);
                setIsLeaveModalOpen(false);
              }} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors font-bold text-sm shadow-sm">Save Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview & Edit Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/70 dark:bg-[#0a0a0a]/60 backdrop-blur-3xl rounded-xl shadow-xl dark:shadow-2xl dark:shadow-black/50 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/30 shrink-0">
              <div>
                <h3 className="font-bold text-lg text-zinc-900 dark:text-white">Preview & Edit Data</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 dark:text-zinc-500">Make any final adjustments before generating the Excel file.</p>
              </div>
              <button onClick={() => setIsPreviewOpen(false)} className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:text-zinc-500"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-[#1f2937]/50 border-b border-zinc-200/50 dark:border-white/5 text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wider">
                    <th className="py-3 px-4 font-bold">Date</th>
                    <th className="py-3 px-4 font-bold">Time In</th>
                    <th className="py-3 px-4 font-bold">Break Out</th>
                    <th className="py-3 px-4 font-bold">Break In</th>
                    <th className="py-3 px-4 font-bold">Time Out</th>
                    <th className="py-3 px-4 font-bold">Remarks</th>
                    <th className="py-3 px-4 font-bold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-zinc-700 dark:text-zinc-300">
                  {filteredPreviewList.map(record => (
                    <tr key={record.date} className="border-b border-zinc-100 dark:border-white/5 hover:bg-zinc-50 dark:hover:bg-white/5 dark:bg-transparent transition-colors">
                      <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white whitespace-nowrap">{record.date}</td>
                      <td className="py-2 px-4">
                        <input type="time" value={record.timeIn} onChange={(e) => handlePreviewEdit(record.date, 'timeIn', e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.08] rounded px-2 py-1 outline-none bg-transparent focus:border-blue-500 font-mono text-sm" />
                      </td>
                      <td className="py-2 px-4">
                        <input type="time" value={record.breakOut} onChange={(e) => handlePreviewEdit(record.date, 'breakOut', e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.08] rounded px-2 py-1 outline-none bg-transparent focus:border-blue-500 font-mono text-sm" />
                      </td>
                      <td className="py-2 px-4">
                        <input type="time" value={record.breakIn} onChange={(e) => handlePreviewEdit(record.date, 'breakIn', e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.08] rounded px-2 py-1 outline-none bg-transparent focus:border-blue-500 font-mono text-sm" />
                      </td>
                      <td className="py-2 px-4">
                        <input type="time" value={record.timeOut} onChange={(e) => handlePreviewEdit(record.date, 'timeOut', e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.08] rounded px-2 py-1 outline-none bg-transparent focus:border-blue-500 font-mono text-sm" />
                      </td>
                      <td className="py-2 px-4">
                        <input type="text" value={record.remarks} onChange={(e) => handlePreviewEdit(record.date, 'remarks', e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.08] rounded px-2 py-1 outline-none bg-transparent focus:border-blue-500 text-sm" placeholder="Add remark..." />
                      </td>
                    </tr>
                  ))}
                  {filteredPreviewList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500 dark:text-zinc-400 dark:text-zinc-500">No records to preview in this range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsPreviewOpen(false)} className="px-5 py-2 rounded-lg font-medium text-zinc-600 dark:text-zinc-400 dark:text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleConfirmExport} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2 rounded-lg flex items-center gap-2 shadow-sm dark:shadow-none transition-colors active:scale-95" disabled={filteredPreviewList.length === 0}>
                <Download size={18} />
                Confirm & Export
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-8 py-8 flex flex-col gap-8">

        {/* Top Section: Clock & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Clock Card */}
          <div className="bg-white/70 dark:bg-[#0a0a0a]/60 backdrop-blur-3xl rounded-xl border border-zinc-200/50 dark:border-white/[0.08] p-8 flex flex-col justify-center items-center relative overflow-hidden transition-colors">
            
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-3">
              <Calendar size={18} />
              <span className="font-semibold text-sm">{format(currentTime, 'EEEE, MMMM do, yyyy')}</span>
            </div>
            <div className="text-5xl lg:text-6xl font-light text-zinc-900 dark:text-white tracking-tight tabular-nums drop-shadow-sm dark:shadow-none">
              {format(currentTime, 'HH:mm:ss')}
            </div>
            <p className="text-zinc-400 dark:text-zinc-500 mt-3 text-xs font-bold uppercase tracking-[0.2em]">Current Time</p>
          </div>

          {/* Punch Actions */}
          <div className="lg:col-span-2 bg-white/70 dark:bg-[#0a0a0a]/60 backdrop-blur-3xl rounded-xl border border-zinc-200/50 dark:border-white/[0.08] shadow-sm dark:shadow-none p-8 flex flex-col justify-center hover:border-zinc-300 dark:border-zinc-700 transition-colors">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Clock size={20} className="text-zinc-400 dark:text-zinc-500" />
                Daily Attendance Terminal
              </h2>
              
              <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/50 px-4 py-2 rounded-xl flex flex-col items-end shadow-sm dark:shadow-none">
                <span className="text-[10px] uppercase font-bold text-blue-500 dark:text-blue-400 tracking-wider">Total Work Today</span>
                <span className="text-xl font-bold font-mono text-blue-700 dark:text-blue-400">{computeTodayWork()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <PunchButton
                title="Time In"
                time={todayRecord.timeIn}
                onClick={() => {
                  setPunchPromptType('timeIn');
                  setPunchPromptTime('');
                  setPunchPromptReason('');
                  setPunchPromptOpen(true);
                }}
                disabled={!!todayRecord.timeIn}
                icon={<ArrowRight size={22} />}
                colorClass="text-zinc-900 dark:text-white bg-white dark:bg-[#111] border-zinc-200/50 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a]"
              />
              <PunchButton
                title="Break Out"
                time={todayRecord.breakOut}
                onClick={() => {
                  setPunchPromptType('breakOut');
                  setPunchPromptTime('');
                  setPunchPromptReason('');
                  setPunchPromptOpen(true);
                }}
                disabled={!todayRecord.timeIn || !!todayRecord.breakOut}
                icon={<Coffee size={22} />}
                colorClass="text-zinc-900 dark:text-white bg-white dark:bg-[#111] border-zinc-200/50 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a]"
              />
              <PunchButton
                title="Break In"
                time={todayRecord.breakIn}
                onClick={() => {
                  setPunchPromptType('breakIn');
                  setPunchPromptTime('');
                  setPunchPromptReason('');
                  setPunchPromptOpen(true);
                }}
                disabled={!todayRecord.breakOut || !!todayRecord.breakIn}
                icon={<ArrowLeft size={22} />}
                colorClass="text-zinc-900 dark:text-white bg-white dark:bg-[#111] border-zinc-200/50 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a]"
              />
              <PunchButton
                title="Time Out"
                time={todayRecord.timeOut}
                onClick={() => {
                  setPunchPromptType('timeOut');
                  setPunchPromptTime('');
                  setPunchPromptReason('');
                  setPunchPromptOpen(true);
                }}
                disabled={!todayRecord.breakIn && !!todayRecord.timeIn && !todayRecord.timeOut === false}
                icon={<ArrowLeft size={22} />}
                colorClass="text-zinc-900 dark:text-white bg-white dark:bg-[#111] border-zinc-200/50 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a]"
              />
            </div>
          </div>
        </div>

        {/* Data Table Section */}
        <div className="bg-white/70 dark:bg-[#0a0a0a]/60 backdrop-blur-3xl rounded-xl border border-zinc-200/50 dark:border-white/[0.08] shadow-sm dark:shadow-none overflow-hidden flex flex-col mb-12">
          <div className="p-6 border-b border-zinc-200/50 dark:border-zinc-800 flex flex-col lg:flex-row justify-between items-start lg:items-center bg-zinc-50/50 dark:bg-zinc-800/30 gap-4">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Attendance Log & Computations</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 mt-1 font-medium">Review your daily records and computed hours</p>
              
              <div className="flex items-center gap-1 mt-4 bg-zinc-200/50 dark:bg-zinc-900 p-1 rounded-xl w-fit">
                <button 
                  onClick={() => setTableTab('all')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${tableTab === 'all' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >All Records</button>
                <button 
                  onClick={() => setTableTab('leaves')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${tableTab === 'leaves' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >Leaves & Holidays</button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">

              {/* FILTER CONTROLS */}
              <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200/50 dark:border-white/[0.08] shadow-sm dark:shadow-none w-full sm:w-auto">
                <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 dark:text-zinc-500">Filter:</span>

                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as 'range' | 'month')}
                  className="text-sm outline-none bg-transparent text-zinc-700 dark:text-zinc-300 bg-transparent cursor-pointer hover:text-zinc-900 dark:text-white font-medium"
                >
                  <option value="month">By Month</option>
                  <option value="range">Date Range</option>
                </select>

                <div className="h-4 w-px bg-zinc-300 mx-1"></div>

                {filterMode === 'month' ? (
                  <input
                    type="month"
                    value={monthFilter}
                    onChange={e => setMonthFilter(e.target.value)}
                    className="text-sm outline-none bg-transparent text-zinc-700 dark:text-zinc-300 bg-transparent"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="text-sm outline-none bg-transparent text-zinc-700 dark:text-zinc-300 bg-transparent"
                    />
                    <span className="text-zinc-400 dark:text-zinc-500">to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="text-sm outline-none bg-transparent text-zinc-700 dark:text-zinc-300 bg-transparent"
                    />
                  </div>
                )}
              </div>

                            <button
                onClick={() => {
                  setLeaveDateInput(format(new Date(currentTime.getTime() + 86400000), 'yyyy-MM-dd'));
                  setLeaveRemarkInput('Vacation Leave');
                  setIsLeaveModalOpen(true);
                }}
                className="flex items-center justify-center gap-2 bg-white dark:bg-zinc-900 border-2 border-zinc-200/50 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 px-5 py-2.5 rounded-xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:bg-zinc-900/50 hover:border-zinc-300 dark:border-zinc-700 hover:text-zinc-900 dark:text-white transition-all shadow-sm dark:shadow-none text-sm active:scale-95 w-full sm:w-auto shrink-0"
              >
                <CalendarPlus size={18} className="text-emerald-600 dark:text-emerald-400" />
                Add Future Leave
              </button>
              <button
                onClick={handleOpenPreview}
                className="flex items-center justify-center gap-2 bg-white dark:bg-zinc-900 border-2 border-zinc-200/50 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 px-5 py-2.5 rounded-xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:bg-zinc-900/50 hover:border-zinc-300 dark:border-zinc-700 hover:text-zinc-900 dark:text-white transition-all shadow-sm dark:shadow-none text-sm active:scale-95 w-full sm:w-auto shrink-0"
              >
                <Download size={18} className="text-blue-600 dark:text-blue-400" />
                Preview Export
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-zinc-100 dark:bg-[#1f2937]/50 border-b border-zinc-200/50 dark:border-white/5 text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="py-4 px-6 font-bold">Date</th>
                  <th className="py-4 px-6 font-bold text-center">Time In</th>
                  <th className="py-4 px-6 font-bold text-center">Break Out</th>
                  <th className="py-4 px-6 font-bold text-center">Break In</th>
                  <th className="py-4 px-6 font-bold text-center">Time Out</th>
                  <th className="py-4 px-6 font-bold text-center bg-blue-50 dark:bg-blue-900/10">Total Work</th>
                  <th className="py-4 px-6 font-bold text-center bg-amber-50/30 dark:bg-amber-900/10">Total OT</th>
                  <th className="py-4 px-6 font-bold text-center bg-rose-50/30 dark:bg-rose-900/10">Undertime</th>
                  <th className="py-4 px-6 font-bold w-64">Remarks</th>
                </tr>
              </thead>
              <tbody className="text-sm text-zinc-700 dark:text-zinc-300">
                {recordsToDisplay.map(record => {

                  // Compute for UI
                  const tIn = parseTime(record.timeIn);
                  const tOut = parseTime(record.timeOut);
                  const bOut = parseTime(record.breakOut);
                  const bIn = parseTime(record.breakIn);

                  let officeMins = 0;
                  if (tIn !== null && tOut !== null) officeMins = tOut - tIn;

                  let breakMins = 0;
                  if (bOut !== null && bIn !== null) breakMins = bIn - bOut;

                  const workMins = Math.max(0, officeMins - breakMins);
                  const standardMins = 8 * 60;
                  let utMins = 0;
                  let otMins = 0;
                  if (workMins > 0) {
                    if (workMins < standardMins) utMins = standardMins - workMins;
                    else if (workMins > standardMins) otMins = workMins - standardMins;
                  }

                  const showComputations = tIn !== null && tOut !== null;

                  return (
                    <tr key={record.date} className="border-b border-zinc-100 dark:border-white/5 hover:bg-zinc-50 dark:hover:bg-white/5 dark:bg-transparent transition-colors group">
                      <td className="py-4 px-6 font-semibold text-zinc-900 dark:text-white whitespace-nowrap">{record.date}</td>
                      <td className="py-4 px-6 text-center font-mono">{record.timeIn || <span className="text-zinc-300 dark:text-zinc-700">—</span>}</td>
                      <td className="py-4 px-6 text-center font-mono">{record.breakOut || <span className="text-zinc-300 dark:text-zinc-700">—</span>}</td>
                      <td className="py-4 px-6 text-center font-mono">{record.breakIn || <span className="text-zinc-300 dark:text-zinc-700">—</span>}</td>
                      <td className="py-4 px-6 text-center font-mono">{record.timeOut || <span className="text-zinc-300 dark:text-zinc-700">—</span>}</td>

                      <td className="py-4 px-6 text-center font-mono font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10">
                        {showComputations ? formatMinutes(workMins) : <span className="text-zinc-300 dark:text-zinc-700">—</span>}
                      </td>
                      <td className="py-4 px-6 text-center font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-50/10 dark:bg-amber-900/10">
                        {showComputations ? formatMinutes(otMins) : <span className="text-zinc-300 dark:text-zinc-700">—</span>}
                      </td>
                      <td className="py-4 px-6 text-center font-mono font-bold text-rose-700 dark:text-rose-400 bg-rose-50/10 dark:bg-rose-900/10">
                        {showComputations ? formatMinutes(utMins) : <span className="text-zinc-300 dark:text-zinc-700">—</span>}
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={record.remarks}
                              onChange={(e) => handleRemarkChange(record.date, e.target.value)}
                              placeholder="Add remark..."
                              className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.08] hover:border-zinc-300 dark:border-zinc-700 focus:bg-white dark:bg-zinc-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg px-3 py-2 outline-none bg-transparent transition-all placeholder:text-zinc-400 dark:text-zinc-500 text-sm font-medium"
                            />
                          </div>
                          <button
                            onClick={() => setRecordToDelete(record.date)}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Delete Record"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {Object.keys(records).length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-zinc-500 dark:text-zinc-400 dark:text-zinc-500">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800/50 rounded-full flex items-center justify-center text-zinc-300 mb-2">
                          <Calendar size={32} />
                        </div>
                        <p className="font-medium text-zinc-600 dark:text-zinc-400 dark:text-zinc-500">No attendance records found.</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">Punch in above to create your first record.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* App Footer */}
      <footer className="mt-12 mb-8 text-center text-xs font-medium text-zinc-400 dark:text-zinc-600">
        ClockedIn v1.0.0 • Developed by <strong>Kim Castor</strong>
      </footer>
    </div>
  );
}

function PunchButton({ title, time, onClick, disabled, icon, colorClass }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center justify-center p-5 rounded-xl border-2 transition-all duration-200 ${disabled ? 'opacity-50 bg-zinc-50 border-zinc-100 text-zinc-400 cursor-not-allowed grayscale-[0.5]' : `${colorClass} shadow-sm active:scale-[0.97] cursor-pointer hover:shadow-md`}`}
    >
      <div className="mb-3 opacity-90">{icon}</div>
      <span className="font-bold text-sm mb-1 tracking-wide">{title}</span>
      <span className="text-xs font-mono font-bold opacity-75">{time || '--:--'}</span>
    </button>
  );
}
