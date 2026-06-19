import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Clock, Download, ArrowRight, ArrowLeft, Coffee, Briefcase, User, Calendar, Settings, X, Save } from 'lucide-react';

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
    payrollPeriod: ''
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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

  const handlePunch = (type: 'timeIn' | 'breakOut' | 'breakIn' | 'timeOut') => {
    const timeStr = format(currentTime, 'HH:mm');
    const newRecord = { ...getTodayRecord(), [type]: timeStr };
    saveRecords({ ...records, [todayStr]: newRecord });
  };

  const handlePreviewEdit = (date: string, field: keyof AttendanceRecord, value: string) => {
    const record = previewRecords[date] || { date, timeIn: '', breakOut: '', breakIn: '', timeOut: '', remarks: '' };
    setPreviewRecords({ ...previewRecords, [date]: { ...record, [field]: value } });
  };

  const todayRecord = getTodayRecord();

  const computeTodayWork = () => {
    const tIn = parseTime(todayRecord.timeIn);
    if (tIn === null) return '0:00';

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

    const workMins = Math.max(0, officeMins - breakMins);
    return formatMinutes(workMins);
  };

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
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg shadow-sm shadow-blue-200">
            <Briefcase size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight tracking-tight">Telcom Live Content</h1>
            <p className="text-xs text-slate-500 font-semibold tracking-wide uppercase mt-0.5">Time & Attendance</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-slate-900">{employeeInfo.name}</span>
            <span className="text-xs text-slate-500 font-medium">{employeeInfo.position} • ID: {employeeInfo.id}</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center border border-slate-200 text-slate-600 transition-colors shadow-sm cursor-pointer"
            title="Edit Information"
          >
            <User size={20} />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={18} className="text-blue-600" /> Personal Information</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              saveSettings({
                name: formData.get('name') as string,
                position: formData.get('position') as string,
                id: formData.get('id') as string,
                payrollPeriod: '', // We don't save this anymore, it's computed dynamically
              });
            }} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                <input name="name" defaultValue={employeeInfo.name} required className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Position</label>
                <input name="position" defaultValue={employeeInfo.position} required className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Employee ID No.</label>
                <input name="id" defaultValue={employeeInfo.id} required className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="mt-4 flex justify-end">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors">
                  <Save size={18} /> Save Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview & Edit Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Preview & Edit Data</h3>
                <p className="text-sm text-slate-500">Make any final adjustments before generating the Excel file.</p>
              </div>
              <button onClick={() => setIsPreviewOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-slate-100/50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="py-3 px-4 font-bold">Date</th>
                    <th className="py-3 px-4 font-bold">Time In</th>
                    <th className="py-3 px-4 font-bold">Break Out</th>
                    <th className="py-3 px-4 font-bold">Break In</th>
                    <th className="py-3 px-4 font-bold">Time Out</th>
                    <th className="py-3 px-4 font-bold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-700">
                  {filteredPreviewList.map(record => (
                    <tr key={record.date} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">{record.date}</td>
                      <td className="py-2 px-4">
                        <input type="time" value={record.timeIn} onChange={(e) => handlePreviewEdit(record.date, 'timeIn', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500 font-mono text-sm" />
                      </td>
                      <td className="py-2 px-4">
                        <input type="time" value={record.breakOut} onChange={(e) => handlePreviewEdit(record.date, 'breakOut', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500 font-mono text-sm" />
                      </td>
                      <td className="py-2 px-4">
                        <input type="time" value={record.breakIn} onChange={(e) => handlePreviewEdit(record.date, 'breakIn', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500 font-mono text-sm" />
                      </td>
                      <td className="py-2 px-4">
                        <input type="time" value={record.timeOut} onChange={(e) => handlePreviewEdit(record.date, 'timeOut', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500 font-mono text-sm" />
                      </td>
                      <td className="py-2 px-4">
                        <input type="text" value={record.remarks} onChange={(e) => handlePreviewEdit(record.date, 'remarks', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500 text-sm" placeholder="Add remark..." />
                      </td>
                    </tr>
                  ))}
                  {filteredPreviewList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">No records to preview in this range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsPreviewOpen(false)} className="px-5 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleConfirmExport} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors active:scale-95" disabled={filteredPreviewList.length === 0}>
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col justify-center items-center relative overflow-hidden group hover:border-blue-200 transition-colors">
            <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-80 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center gap-2 text-blue-600 mb-3">
              <Calendar size={18} />
              <span className="font-semibold text-sm">{format(currentTime, 'EEEE, MMMM do, yyyy')}</span>
            </div>
            <div className="text-5xl lg:text-6xl font-light text-slate-900 tracking-tight tabular-nums drop-shadow-sm">
              {format(currentTime, 'HH:mm:ss')}
            </div>
            <p className="text-slate-400 mt-3 text-xs font-bold uppercase tracking-[0.2em]">Current Time</p>
          </div>

          {/* Punch Actions */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col justify-center hover:border-slate-300 transition-colors">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Clock size={20} className="text-slate-400" />
                Daily Time In and Time Out
              </h2>
              
              <div className="bg-blue-50/70 border border-blue-100 px-4 py-2 rounded-xl flex flex-col items-end shadow-sm">
                <span className="text-[10px] uppercase font-bold text-blue-500 tracking-wider">Total Work Today</span>
                <span className="text-xl font-bold font-mono text-blue-700">{computeTodayWork()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <PunchButton
                title="Time In"
                time={todayRecord.timeIn}
                onClick={() => handlePunch('timeIn')}
                disabled={!!todayRecord.timeIn}
                icon={<ArrowRight size={22} />}
                colorClass="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
              />
              <PunchButton
                title="Break Out"
                time={todayRecord.breakOut}
                onClick={() => handlePunch('breakOut')}
                disabled={!todayRecord.timeIn || !!todayRecord.breakOut}
                icon={<Coffee size={22} />}
                colorClass="text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
              />
              <PunchButton
                title="Break In"
                time={todayRecord.breakIn}
                onClick={() => handlePunch('breakIn')}
                disabled={!todayRecord.breakOut || !!todayRecord.breakIn}
                icon={<ArrowLeft size={22} />}
                colorClass="text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
              />
              <PunchButton
                title="Time Out"
                time={todayRecord.timeOut}
                onClick={() => handlePunch('timeOut')}
                disabled={!todayRecord.breakIn && !!todayRecord.timeIn && !todayRecord.timeOut === false}
                icon={<ArrowLeft size={22} />}
                colorClass="text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200"
              />
            </div>
          </div>
        </div>

        {/* Data Table Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col mb-12">
          <div className="p-6 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-50/50 gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Attendance Log & Computations</h2>
              <p className="text-sm text-slate-500 mt-1 font-medium">Review your daily records and computed hours</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">

              {/* FILTER CONTROLS */}
              <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm w-full sm:w-auto">
                <span className="text-sm font-semibold text-slate-500">Filter:</span>

                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as 'range' | 'month')}
                  className="text-sm outline-none text-slate-700 bg-transparent cursor-pointer hover:text-slate-900 font-medium"
                >
                  <option value="month">By Month</option>
                  <option value="range">Date Range</option>
                </select>

                <div className="h-4 w-px bg-slate-300 mx-1"></div>

                {filterMode === 'month' ? (
                  <input
                    type="month"
                    value={monthFilter}
                    onChange={e => setMonthFilter(e.target.value)}
                    className="text-sm outline-none text-slate-700 bg-transparent"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="text-sm outline-none text-slate-700 bg-transparent"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="text-sm outline-none text-slate-700 bg-transparent"
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handleOpenPreview}
                className="flex items-center justify-center gap-2 bg-white border-2 border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-all shadow-sm text-sm active:scale-95 w-full sm:w-auto shrink-0"
              >
                <Download size={18} className="text-blue-600" />
                Preview Export
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-slate-100/50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="py-4 px-6 font-bold">Date</th>
                  <th className="py-4 px-6 font-bold text-center">Time In</th>
                  <th className="py-4 px-6 font-bold text-center">Break Out</th>
                  <th className="py-4 px-6 font-bold text-center">Break In</th>
                  <th className="py-4 px-6 font-bold text-center">Time Out</th>
                  <th className="py-4 px-6 font-bold text-center bg-blue-50/30">Total Work</th>
                  <th className="py-4 px-6 font-bold text-center bg-amber-50/30">Total OT</th>
                  <th className="py-4 px-6 font-bold text-center bg-rose-50/30">Undertime</th>
                  <th className="py-4 px-6 font-bold w-64">Remarks</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-700">
                {filteredRecordsList.map(record => {

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
                    <tr key={record.date} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                      <td className="py-4 px-6 font-semibold text-slate-900 whitespace-nowrap">{record.date}</td>
                      <td className="py-4 px-6 text-center font-mono">{record.timeIn || <span className="text-slate-300">—</span>}</td>
                      <td className="py-4 px-6 text-center font-mono">{record.breakOut || <span className="text-slate-300">—</span>}</td>
                      <td className="py-4 px-6 text-center font-mono">{record.breakIn || <span className="text-slate-300">—</span>}</td>
                      <td className="py-4 px-6 text-center font-mono">{record.timeOut || <span className="text-slate-300">—</span>}</td>

                      <td className="py-4 px-6 text-center font-mono font-bold text-blue-700 bg-blue-50/10">
                        {showComputations ? formatMinutes(workMins) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-4 px-6 text-center font-mono font-bold text-amber-700 bg-amber-50/10">
                        {showComputations ? formatMinutes(otMins) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-4 px-6 text-center font-mono font-bold text-rose-700 bg-rose-50/10">
                        {showComputations ? formatMinutes(utMins) : <span className="text-slate-300">—</span>}
                      </td>

                      <td className="py-4 px-6">
                        <div className="relative">
                          <input
                            type="text"
                            value={record.remarks}
                            onChange={(e) => handleRemarkChange(record.date, e.target.value)}
                            placeholder="Add remark..."
                            className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg px-3 py-2 outline-none transition-all placeholder:text-slate-400 text-sm font-medium"
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {Object.keys(records).length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-2">
                          <Calendar size={32} />
                        </div>
                        <p className="font-medium text-slate-600">No attendance records found.</p>
                        <p className="text-xs text-slate-400">Punch in above to create your first record.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function PunchButton({ title, time, onClick, disabled, icon, colorClass }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center justify-center p-5 rounded-xl border-2 transition-all duration-200 ${disabled ? 'opacity-50 bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed grayscale-[0.5]' : `${colorClass} shadow-sm active:scale-[0.97] cursor-pointer hover:shadow-md`}`}
    >
      <div className="mb-3 opacity-90">{icon}</div>
      <span className="font-bold text-sm mb-1 tracking-wide">{title}</span>
      <span className="text-xs font-mono font-bold opacity-75">{time || '--:--'}</span>
    </button>
  );
}
