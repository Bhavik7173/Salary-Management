import { useState, useEffect } from 'react';
import { 
  Clock, 
  TrendingUp, 
  Wallet, 
  Receipt, 
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Palmtree,
  Thermometer
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { summaryApi, exportApi, entriesApi, vacationApi } from '../lib/api';
import { toast } from 'sonner';

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function Dashboard() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekEntries, setWeekEntries] = useState([]);
  const [balances, setBalances]       = useState([]);

  useEffect(() => {
    fetchSummary();
  }, [year, month]);

  useEffect(() => {
    fetchWeekAndBalances();
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const response = await summaryApi.get(year, month);
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
      toast.error('Failed to load monthly summary');
    } finally {
      setLoading(false);
    }
  };

  const fetchWeekAndBalances = async () => {
    try {
      // Get all entries for current month and filter to current week
      const today = new Date();
      const dow = today.getDay() === 0 ? 6 : today.getDay() - 1; // Mon=0
      const weekStart = new Date(today); weekStart.setDate(today.getDate() - dow);
      const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
      const fmt = d => d.toISOString().slice(0, 10);

      const [entRes, balRes] = await Promise.all([
        entriesApi.getAll(today.getFullYear(), today.getMonth() + 1),
        vacationApi.getBalances(),
      ]);
      const week = entRes.data.filter(e => e.date >= fmt(weekStart) && e.date <= fmt(weekEnd));
      setWeekEntries(week.sort((a, b) => a.date.localeCompare(b.date)));
      setBalances(balRes.data);
    } catch {}
  };

  const handleExportExcel = async () => {
    try {
      const response = await exportApi.excel(year, month);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `salary_report_${year}_${String(month).padStart(2, '0')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Excel exported successfully');
    } catch (error) {
      toast.error('Failed to export Excel');
    }
  };

  const kpiCards = [
    {
      title: 'Total Hours',
      value: summary?.total_worked_hours?.toFixed(2) || '0.00',
      unit: 'hrs',
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      title: 'Payable Hours',
      value: summary?.payable_hours?.toFixed(2) || '0.00',
      unit: 'hrs',
      subtext: `Worked: ${summary?.total_worked_hours?.toFixed(2) || '0.00'} hrs`,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      title: 'AZK Change',
      value: `${summary?.azk_change >= 0 ? '+' : ''}${summary?.azk_change?.toFixed(2) || '0.00'}`,
      unit: 'hrs',
      subtext: `Bank: ${summary?.azk_bank_total?.toFixed(2) || '0.00'} hrs`,
      icon: summary?.azk_change >= 0 ? ArrowUpRight : ArrowDownRight,
      color: summary?.azk_change >= 0 ? 'text-emerald-600' : 'text-orange-600',
      bgColor: summary?.azk_change >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-orange-50 dark:bg-orange-900/20',
    },
    {
      title: 'Net Pay',
      value: `€${(summary?.final_payout ?? summary?.net_pay ?? 0).toFixed(2)}`,
      unit: '',
      icon: Wallet,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
  ];

  return (
    <div className="space-y-6 animate-in" data-testid="dashboard-page">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">
            Monthly Summary
          </h1>
          <p className="text-muted-foreground mt-1">
            Track your hours and earnings at a glance
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-3">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36" data-testid="month-selector">
              <Calendar className="w-4 h-4 mr-2 opacity-50" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28" data-testid="year-selector">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            variant="outline" 
            onClick={handleExportExcel}
            data-testid="export-excel-btn"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────── */}
      {(() => {
        const alerts = [];
        if (summary?.azk_bank_total < 0)
          alerts.push({ type: 'error', icon: AlertTriangle, msg: `AZK bank is negative (${summary.azk_bank_total.toFixed(2)} hrs). Your salary may be reduced next month.` });
        else if (summary?.azk_bank_total < 5 && summary?.azk_bank_total >= 0)
          alerts.push({ type: 'warn', icon: AlertTriangle, msg: `AZK bank is low (${summary.azk_bank_total?.toFixed(2)} hrs). Consider working extra hours soon.` });
        balances.forEach(b => {
          if (b.remaining <= 0)
            alerts.push({ type: 'error', icon: Palmtree, msg: `${b.balance_year} vacation balance is fully used (${b.used}/${b.total_entitlement} days).` });
          else if (b.remaining <= 3)
            alerts.push({ type: 'warn', icon: Palmtree, msg: `Only ${b.remaining} vacation days left from ${b.balance_year} entitlement.` });
        });
        if (alerts.length === 0) return null;
        return (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-lg text-sm font-medium
                ${a.type === 'error'
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                  : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                }`}>
                <a.icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{a.msg}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── This Week ────────────────────────────────────────────── */}
      {weekEntries.length > 0 && (() => {
        const totalHrs = weekEntries.reduce((s, e) => s + (e.working_hours || 0), 0);
        const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const today = new Date().toISOString().slice(0,10);
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading flex items-center gap-2 text-base">
                <Clock className="w-4 h-4 text-primary" />
                This Week at a Glance
                <span className="ml-auto text-sm font-mono font-normal text-muted-foreground">
                  {totalHrs.toFixed(2)} hrs total
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1.5">
                {days.map((d, i) => {
                  const todayDow = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
                  const dow = new Date(); dow.setDate(dow.getDate() - todayDow + i);
                  const ds = dow.toISOString().slice(0,10);
                  const entry = weekEntries.find(e => e.date === ds);
                  const isToday = ds === today;
                  const hrs = entry?.working_hours || 0;
                  const pct = Math.min((hrs / 8) * 100, 100);
                  return (
                    <div key={d} className={`flex flex-col items-center gap-1.5 p-2 rounded-lg
                      ${isToday ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-muted/40'}`}>
                      <span className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{d}</span>
                      <div className="w-full h-16 bg-muted rounded relative overflow-hidden flex items-end">
                        <div className="w-full rounded transition-all duration-500"
                          style={{ height: `${pct}%`, backgroundColor: hrs >= 6 ? 'hsl(var(--primary))' : hrs > 0 ? 'hsl(var(--muted-foreground))' : 'transparent' }} />
                      </div>
                      <span className="text-xs font-mono font-semibold">{hrs > 0 ? `${hrs.toFixed(1)}h` : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => (
          <Card 
            key={kpi.title} 
            className="card-hover"
            data-testid={`kpi-card-${index}`}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {kpi.title}
                  </p>
                  <p className="text-2xl font-heading font-bold text-foreground mt-2">
                    <span className="font-mono">{kpi.value}</span>
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      {kpi.unit}
                    </span>
                  </p>
                  {kpi.subtext && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {kpi.subtext}
                    </p>
                  )}
                </div>
                <div className={`p-2.5 rounded-lg ${kpi.bgColor}`}>
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart and Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart */}
        <Card className="lg:col-span-2" data-testid="hours-chart-card">
          <CardHeader>
            <CardTitle className="font-heading">Daily Hours</CardTitle>
            <CardDescription>
              Work hours distribution for {months[month - 1]} {year}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {summary?.daily_hours?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.daily_hours}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="day" 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value) => [`${value} hrs`, 'Hours']}
                      labelFormatter={(label) => `Day ${label}`}
                    />
                    <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                      {summary.daily_hours.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.hours >= 6 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available for this period
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card data-testid="financial-summary-card">
          <CardHeader>
            <CardTitle className="font-heading flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              Financial Summary
            </CardTitle>
            <CardDescription>
              Breakdown for {months[month - 1]}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-0">
              {/* Row helper */}
              {[
                { label: 'Base Pay (taxable)',
                  value: `€${summary?.gross_pay?.toFixed(2) || '0.00'}`,
                  cls: 'text-muted-foreground', valCls: 'font-mono font-medium' },
                { label: 'Tax',
                  value: `-€${summary?.tax?.toFixed(2) || '0.00'}`,
                  cls: 'text-red-500', valCls: 'font-mono text-red-500' },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center py-2 border-b border-border">
                  <span className={`text-sm ${r.cls}`}>{r.label}</span>
                  <span className={r.valCls}>{r.value}</span>
                </div>
              ))}

              {/* Net Earned subtotal */}
              <div className="flex justify-between items-center py-2 border-b border-border bg-muted/20 px-2 -mx-2 rounded">
                <span className="text-sm font-semibold">Net Earned (after tax)</span>
                <span className="font-mono font-semibold">
                  €{summary?.net_pay?.toFixed(2) || '0.00'}
                </span>
              </div>

              {/* Post-tax additions — only show if > 0 */}
              {(summary?.bonus_total > 0) && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm text-emerald-500">+ Bonus (tax-free)</span>
                  <span className="font-mono text-emerald-500">
                    +€{summary?.bonus_total?.toFixed(2)}
                  </span>
                </div>
              )}
              {(summary?.travel_total > 0) && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm text-emerald-500">+ Travel Allowance (tax-free)</span>
                  <span className="font-mono text-emerald-500">
                    +€{summary?.travel_total?.toFixed(2)}
                  </span>
                </div>
              )}
              {((summary?.meal_total ?? 0) > 0) && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm text-emerald-500">+ Meal Allowance (tax-free)</span>
                  <span className="font-mono text-emerald-500">
                    +€{summary?.meal_total?.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Final Payout — always visible */}
            <div className="pt-3 mt-2 border-t-2 border-primary/30 bg-primary/5 -mx-6 px-6 pb-2 rounded-b-lg">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-bold text-lg">Final Payout</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Net + bonus + travel + meal
                  </p>
                </div>
                <span className="font-mono font-bold text-2xl text-primary">
                  €{(summary?.final_payout ?? summary?.net_pay ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Entries */}
      <Card data-testid="recent-entries-card">
        <CardHeader>
          <CardTitle className="font-heading">Recent Entries</CardTitle>
          <CardDescription>
            Last {Math.min(5, summary?.entries?.length || 0)} work log entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Break</th>
                  <th>Hours</th>
                  <th>Holiday</th>
                  <th>Travel</th>
                  <th>Bonus</th>
                </tr>
              </thead>
              <tbody>
                {summary?.entries?.slice(0, 5).map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-mono">{entry.date}</td>
                    <td className="font-mono">{entry.start_time}</td>
                    <td className="font-mono">{entry.end_time}</td>
                    <td className="font-mono">{entry.break_hours}h</td>
                    <td className="font-mono font-medium">{entry.working_hours.toFixed(2)}h</td>
                    <td className="text-center">
                      {entry.is_public_holiday
                        ? <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">Yes</span>
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                    </td>
                    <td className="font-mono">€{entry.travel_allowance?.toFixed(2) || '0.00'}</td>
                    <td className="font-mono">€{entry.bonus?.toFixed(2) || '0.00'}</td>
                  </tr>
                ))}
                {(!summary?.entries || summary.entries.length === 0) && (
                  <tr>
                    <td colSpan={8} className="text-center text-muted-foreground py-8">
                      No entries for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}