import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./context/ThemeContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import DailyEntry from "./pages/DailyEntry";
import Upload from "./pages/Upload";
import Payslip from "./pages/Payslip";
import Settings from "./pages/Settings";
import YearlyOverview from "./pages/YearlyOverview";
import Vacation from "./pages/Vacation";
import SickDays from "./pages/SickDays";
import "./App.css";

function App() {
  return (
    <ThemeProvider>
      <div className="App min-h-screen bg-background">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="daily-entry" element={<DailyEntry />} />
              <Route path="upload" element={<Upload />} />
              <Route path="payslip" element={<Payslip />} />
              <Route path="yearly" element={<YearlyOverview />} />
              <Route path="vacation" element={<Vacation />} />
              <Route path="sick-days" element={<SickDays />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </div>
    </ThemeProvider>
  );
}

export default App;