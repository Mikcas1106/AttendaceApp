const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const dataFilePath = path.join(app.getPath('userData'), 'attendance_data.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: nativeImage.createFromPath(path.join(__dirname, 'public', 'icon.png')),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    // In development mode, Vite runs on port 5173
    win.loadURL('http://localhost:5173');
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const settingsFilePath = path.join(app.getPath('userData'), 'attendance_settings.json');

// IPC handlers for saving/loading data
ipcMain.handle('read-data', () => {
  try {
    if (fs.existsSync(dataFilePath)) {
      const data = fs.readFileSync(dataFilePath, 'utf-8');
      return JSON.parse(data);
    }
    return {};
  } catch (err) {
    console.error('Error reading data:', err);
    return {};
  }
});

ipcMain.handle('write-data', (event, data) => {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('Error writing data:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-settings', () => {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const data = fs.readFileSync(settingsFilePath, 'utf-8');
      return JSON.parse(data);
    }
    return null;
  } catch (err) {
    return null;
  }
});

ipcMain.handle('write-settings', (event, data) => {
  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false };
  }
});

const ExcelJS = require('exceljs');
const { dialog } = require('electron');

ipcMain.handle('export-excel', async (event, records, employeeInfo) => {
  try {
    const formattedName = (employeeInfo.name || 'Employee').replace(/\s+/g, '_');
    const period = employeeInfo.payrollPeriod || 'Export';
    // Clean period to remove invalid characters for filenames if necessary
    const safePeriod = period.replace(/[\\/:*?"<>|]/g, '-');
    
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Attendance',
      defaultPath: `${formattedName} - ${safePeriod}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });

    if (!filePath) return { success: false, canceled: true };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Attendance', { views: [{ showGridLines: false }] });

    // Build the exact layout
    sheet.getCell('A1').value = 'Telcom Live Content, Inc.';
    sheet.getCell('A1').font = { bold: true, size: 12 };
    
    sheet.mergeCells('D3:I3');
    sheet.getCell('D3').value = 'TIME AND ATTENDANCE MONITORING';
    sheet.getCell('D3').font = { bold: true, size: 14 };
    sheet.getCell('D3').alignment = { horizontal: 'center' };

    // Employee Info Box
    sheet.getCell('A5').value = 'Name:';
    sheet.mergeCells('B5:C5');
    sheet.getCell('B5').value = employeeInfo?.name || '';
    sheet.getCell('A6').value = 'Position:';
    sheet.mergeCells('B6:C6');
    sheet.getCell('B6').value = employeeInfo?.position || '';
    sheet.getCell('A7').value = 'Employee ID No.:';
    sheet.mergeCells('B7:C7');
    sheet.getCell('B7').value = employeeInfo?.id || '';
    
    sheet.getCell('E5').value = 'Payroll Period Covered:';
    sheet.mergeCells('G5:I5');
    sheet.getCell('G5').value = employeeInfo?.payrollPeriod || ''; 
    sheet.getCell('E6').value = 'No. of days absent';
    sheet.getCell('E7').value = 'No. of hours undertime';

    // Headers
    sheet.mergeCells('A9:A10');
    sheet.getCell('A9').value = 'Date';
    
    sheet.mergeCells('B9:D9');
    sheet.getCell('B9').value = 'Office Time';
    sheet.getCell('B10').value = 'Time In';
    sheet.getCell('C10').value = 'Time Out';
    sheet.getCell('D10').value = 'No. of hours';

    sheet.mergeCells('E9:G9');
    sheet.getCell('E9').value = 'Break Time';
    sheet.getCell('E10').value = 'Time Out';
    sheet.getCell('F10').value = 'Time In';
    sheet.getCell('G10').value = 'No. of hours';

    sheet.mergeCells('H9:H10');
    sheet.getCell('H9').value = 'No. of\nworking\nhours';
    sheet.getCell('H9').alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells('I9:I10');
    sheet.getCell('I9').value = 'Hours\nUndertime';
    sheet.getCell('I9').alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells('J9:J10');
    sheet.getCell('J9').value = 'REMARKS';

    sheet.mergeCells('K9:K10');
    sheet.getCell('K9').value = 'Signature';

    sheet.mergeCells('M9:M10');
    sheet.getCell('M9').value = 'Total OT';
    sheet.mergeCells('N9:N10');
    sheet.getCell('N9').value = 'Overtime for Offset\n(Possible)';
    sheet.getCell('N9').alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    sheet.mergeCells('O9:O10');
    sheet.getCell('O9').value = 'Undertime';

    // Styling headers
    ['A9', 'B9', 'E9', 'H9', 'I9', 'J9', 'K9', 'M9', 'N9', 'O9', 'B10', 'C10', 'D10', 'E10', 'F10', 'G10'].forEach(cell => {
      sheet.getCell(cell).font = { bold: true };
      sheet.getCell(cell).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Helper functions for computation
    const parseTime = (timeStr) => {
      if (!timeStr) return null;
      const parts = timeStr.split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };

    const formatMinutes = (mins) => {
      if (mins <= 0) return '0:00';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}:${m.toString().padStart(2, '0')}`;
    };

   
    const PH_HOLIDAYS = {
      '01-01': true, '02-25': true, '04-09': true, '05-01': true, 
      '06-12': true, '08-21': true, '08-31': true, '11-01': true, 
      '11-30': true, '12-08': true, '12-25': true, '12-30': true, '12-31': true
    };
    const MOVABLE_HOLIDAYS_2026 = {
      '2026-04-02': true, '2026-04-03': true
    };
    const checkIsHoliday = (dateStr, remarkStr) => {
      const d = new Date(dateStr);
      const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const yyyymmdd = `${d.getFullYear()}-${mmdd}`;
      return PH_HOLIDAYS[mmdd] || MOVABLE_HOLIDAYS_2026[yyyymmdd] || (remarkStr && remarkStr.toLowerCase().includes('holiday')) || (remarkStr && remarkStr.toLowerCase().includes('day') && !remarkStr.toLowerCase().includes('sunday') && !remarkStr.toLowerCase().includes('monday'));
    };

    // Write Records
    let rowNum = 11;
    const sortedDates = Object.keys(records).sort((a,b) => new Date(a).getTime() - new Date(b).getTime());
    
    for (const date of sortedDates) {
      const r = records[date];
      
      const tIn = parseTime(r.timeIn);
      const tOut = parseTime(r.timeOut);
      const bOut = parseTime(r.breakOut);
      const bIn = parseTime(r.breakIn);

      let officeMins = 0;
      if (tIn !== null && tOut !== null) officeMins = tOut - tIn;

      let breakMins = 0;
      if (bOut !== null && bIn !== null) breakMins = bIn - bOut;

      const workMins = Math.max(0, officeMins - breakMins);
      const standardMins = 8 * 60;
      let undertimeMins = 0;
      let otMins = 0;

      if (workMins > 0) {
        if (workMins < standardMins) {
          undertimeMins = standardMins - workMins;
        } else if (workMins > standardMins) {
          otMins = workMins - standardMins;
        }
      }

      sheet.getCell(`A${rowNum}`).value = r.date;
      sheet.getCell(`B${rowNum}`).value = r.timeIn || '';
      sheet.getCell(`C${rowNum}`).value = r.timeOut || '';
      sheet.getCell(`D${rowNum}`).value = tIn && tOut ? formatMinutes(officeMins) : '';
      
      sheet.getCell(`E${rowNum}`).value = r.breakOut || '';
      sheet.getCell(`F${rowNum}`).value = r.breakIn || '';
      sheet.getCell(`G${rowNum}`).value = bOut && bIn ? formatMinutes(breakMins) : '';
      
      sheet.getCell(`H${rowNum}`).value = tIn && tOut ? formatMinutes(workMins) : '';
      sheet.getCell(`I${rowNum}`).value = tIn && tOut ? formatMinutes(undertimeMins) : '';
      
      sheet.getCell(`J${rowNum}`).value = r.remarks || '';
      
      sheet.getCell(`M${rowNum}`).value = tIn && tOut ? formatMinutes(otMins) : '';
      sheet.getCell(`N${rowNum}`).value = tIn && tOut ? formatMinutes(otMins) : '';
      sheet.getCell(`O${rowNum}`).value = tIn && tOut ? formatMinutes(undertimeMins) : '';
      
      const isHol = checkIsHoliday(r.date, r.remarks);
      const isLeave = r.remarks && r.remarks.toLowerCase().includes('leave');

      if (isHol || isLeave) {
        const color = isLeave ? 'FFD9E1F2' : 'FFC6EFCE'; // Light Blue for leave, Light Green for holiday
        for(let c = 1; c <= 15; c++) {
          if (c === 12) continue; // Skip column L
          sheet.getCell(rowNum, c).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: color }
          };
        }
      }
      
      rowNum++;
    }

    // Add borders to all table cells
    for(let r = 9; r < rowNum; r++) {
      for(let c = 1; c <= 15; c++) {
        if (c === 12) continue; // Skip column L for spacing
        sheet.getCell(r, c).border = {
          top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'}
        };
        sheet.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }

    // Set column widths
    sheet.getColumn('A').width = 15;
    sheet.getColumn('B').width = 12;
    sheet.getColumn('C').width = 12;
    sheet.getColumn('D').width = 15;
    sheet.getColumn('E').width = 12;
    sheet.getColumn('F').width = 12;
    sheet.getColumn('G').width = 15;
    sheet.getColumn('H').width = 15;
    sheet.getColumn('I').width = 15;
    sheet.getColumn('J').width = 25;
    sheet.getColumn('K').width = 20;
    sheet.getColumn('L').width = 5; // Spacer
    sheet.getColumn('M').width = 15;
    sheet.getColumn('N').width = 20;
    sheet.getColumn('O').width = 15;

    await workbook.xlsx.writeFile(filePath);
    return { success: true, filePath };

  } catch (err) {
    console.error('Error exporting excel:', err);
    return { success: false, error: err.message };
  }
});
