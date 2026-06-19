# ClockedIn ⏳

A sleek, modern, offline-first Desktop application built for precise time and attendance tracking. Designed with a clean UI, ClockedIn allows employees and teams to reliably log their shifts, breaks, and leaves, and instantly generate comprehensive Excel reports.

Developed by **Kim Castor**.

## 🌟 Key Features

- **Quick Actions:** Easy one-click punches for Time In, Break Out, Break In, and Time Out.
- **Customizable Records:** Ability to adjust past times and add custom remarks (e.g. Vacation Leave, Sick Leave).
- **Future Leaves:** Dedicated modal to schedule future leaves and holidays seamlessly.
- **Data Exporting:** Instantly export formatted Excel reports with professional color coding (e.g., green for holidays, blue for leaves) for HR and payroll.
- **Backup & Restore:** Never lose your data. Download JSON backup files and import them locally across different machines.
- **Discord Integration:** Optional Webhook support to broadcast punches to a specific Discord channel in real-time.
- **Customizable UI:** Toggle between Light and Dark mode, or let the app follow your system theme.

## 🛠 Tech Stack

- **Framework:** [React 18](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Desktop Wrapper:** [Electron](https://www.electronjs.org/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Data Exporting:** [ExcelJS](https://github.com/exceljs/exceljs)

## 🚀 Getting Started (Development)

To run this project locally for development:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run the Development Server**
   ```bash
   npm run dev
   ```
   This will start both the Vite development server and the Electron application concurrently.

## 📦 Building the Executable

You can package ClockedIn into a standalone Windows `.exe` installer. 

1. Stop the development server if it's running.
2. Run the build command:
   ```bash
   npm run dist
   ```
3. Once completed, the final compiled setup file will be located inside the `release/` folder (e.g., `ClockedIn Setup 1.0.0.exe`).

## ⚙️ Data Management & Privacy

ClockedIn is an **offline-first** application. All attendance records, employee information, and settings are stored locally on your machine via the Electron User Data directory, ensuring complete privacy. Use the "Data Management" section in Settings to export and back up your data safely.
