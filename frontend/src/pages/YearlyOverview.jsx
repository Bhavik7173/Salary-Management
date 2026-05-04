import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import {
  TrendingUp, TrendingDown, Euro, Clock, Calendar,
  Download, ChevronLeft, ChevronRight, Banknote, Award
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import api from '../lib/api';
import { toast } from 'sonner';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

const fmt = (n) => (n ?? 0).toFixed(2);
const fmtEur = (n) => `€${fmt(n)}`;
const fmtHrs = (n) => `${fmt(n)}h`;
const sign = (n) => (n >= 0 ? '+' : '') + fmt(n);

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Custom tooltip for charts
const CustomTooltip = ({ active, payload, label, prefix = '', suffix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-mono">
          {p.name}: {prefix}{fmt(p.value)}{suffix}
        </p>
      ))}
    </div>
  );
};

export default function YearlyOverview() {
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchYearly();
  }, [year]);

  const fetchYearly = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/summary/${year}`);
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load yearly overview');
    } finally {
      setLoading(false);
    }
  };

  const activeMonths = data?.months?.filter(m => m.has_data) ?? [];
  const totalMonths = activeMonths.length;

  // Chart data — only months with data for bar charts, all for AZK line
  const barData = data?.months?.map(m => ({
    name: MONTH_SHORT[m.month - 1],
    hours: m.total_worked_hours,
    net: m.net_pay,
    final: m.final_payout ?? m.net_pay,
    gross: m.gross_pay,
    azk: m.azk_bank_total,
    has_data: m.has_data,
  })) ?? [];

  const kpis = data ? [
    {
      label: 'Total Final Payout',
      value: fmtEur(data.total_final_payout ?? data.total_net_pay),
      sub: totalMonths > 0 ? `Ø ${fmtEur((data.total_final_payout ?? data.total_net_pay) / totalMonths)}/month` : '—',
      icon: Euro,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: 'Hours Worked',
      value: fmtHrs(data.total_worked_hours),
      sub: totalMonths > 0 ? `Ø ${fmtHrs(data.total_worked_hours / totalMonths)}/month` : '—',
      icon: Clock,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'AZK Bank',
      value: `${sign(data.final_azk_bank)}h`,
      sub: data.final_azk_bank >= 0 ? 'Balance available' : 'Bank overdrawn',
      icon: data.final_azk_bank >= 0 ? TrendingUp : TrendingDown,
      color: data.final_azk_bank >= 0 ? 'text-emerald-600' : 'text-red-500',
      bg: data.final_azk_bank >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20',
    },
    {
      label: 'Total Tax Paid',
      value: fmtEur(data.total_tax),
      sub: `Gross: ${fmtEur(data.total_gross_pay)}`,
      icon: Banknote,
      color: 'text-orange-600',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
    },
  ] : [];

  return (
    <div className="space-y-6 animate-in" data-testid="yearly-overview-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">
            Yearly Overview
          </h1>
          <p className="text-muted-foreground mt-1">
            Full year breakdown — hours, salary & AZK bank
          </p>
        </div>

        {/* Year navigator */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear(y => y - 1)}
            disabled={year <= currentYear - 4}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="w-20 text-center font-heading font-bold text-lg">{year}</div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear(y => y + 1)}
            disabled={year >= currentYear}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 h-28 bg-muted/30 rounded-lg" />
            </Card>
          ))}
        </div>
      ) : !data || activeMonths.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Calendar className="w-12 h-12 opacity-30" />
            <p className="text-lg font-medium">No data for {year}</p>
            <p className="text-sm">Add work entries to see your yearly overview.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((k) => (
              <Card key={k.label} className="card-hover">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{k.label}</p>
                      <p className="text-2xl font-heading font-bold font-mono text-foreground mt-2">
                        {k.value}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
                    </div>
                    <div className={`p-2.5 rounded-lg ${k.bg}`}>
                      <k.icon className={`w-5 h-5 ${k.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Monthly Hours Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading">Monthly Hours</CardTitle>
                <CardDescription>Worked hours per month vs contract (151.67h)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip suffix="h" />} />
                      <ReferenceLine y={151.67} stroke="hsl(var(--primary))" strokeDasharray="4 4"
                        label={{ value: 'Contract', position: 'insideTopRight', fontSize: 10, fill: 'hsl(var(--primary))' }} />
                      <Bar dataKey="hours" name="Hours" radius={[3, 3, 0, 0]}>
                        {barData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={!entry.has_data
                              ? 'hsl(var(--muted))'
                              : entry.hours >= 151.67
                                ? 'hsl(var(--primary))'
                                : 'hsl(var(--muted-foreground))'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* AZK Bank Line Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading">AZK Bank Balance</CardTitle>
                <CardDescription>Running bank balance across the year</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={barData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip suffix="h" />} />
                      <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                      <Line
                        type="monotone"
                        dataKey="azk"
                        name="AZK Bank"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Net Pay Bar Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-heading">Monthly Net Pay</CardTitle>
                <CardDescription>Final payout (net + bonus + travel + meal) per month in {year}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `€${v}`} />
                      <Tooltip content={<CustomTooltip prefix="€" />} />
                      <Bar dataKey="final" name="Final Payout" radius={[3, 3, 0, 0]}>
                        {barData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.has_data ? 'hsl(var(--primary))' : 'hsl(var(--muted))'}
                            opacity={entry.has_data ? 1 : 0.3}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Month-by-Month Breakdown
              </CardTitle>
              <CardDescription>Detailed figures for every month of {year}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-3 pr-4 font-medium">Month</th>
                      <th className="text-right py-3 px-3 font-medium">Worked</th>
                      <th className="text-right py-3 px-3 font-medium">Payable</th>
                      <th className="text-right py-3 px-3 font-medium">AZK Δ</th>
                      <th className="text-right py-3 px-3 font-medium">AZK Bank</th>
                      <th className="text-right py-3 px-3 font-medium">Bonus</th>
                      <th className="text-right py-3 px-3 font-medium">Travel</th>
                      <th className="text-right py-3 px-3 font-medium">Gross</th>
                      <th className="text-right py-3 px-3 font-medium">Net Pay</th>
                      <th className="text-right py-3 pl-3 font-medium">Final Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => (
                      <tr
                        key={m.month}
                        className={`border-b border-border/50 transition-colors
                          ${m.has_data ? 'hover:bg-muted/30' : 'opacity-40'}`}
                      >
                        <td className="py-3 pr-4 font-medium">{m.month_name}</td>
                        <td className="py-3 px-3 text-right font-mono text-xs">
                          {m.has_data ? fmtHrs(m.total_worked_hours) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs">
                          {m.has_data ? fmtHrs(m.payable_hours) : '—'}
                        </td>
                        <td className={`py-3 px-3 text-right font-mono text-xs font-medium
                          ${m.azk_change > 0 ? 'text-emerald-600' : m.azk_change < 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                          {m.has_data ? `${sign(m.azk_change)}h` : '—'}
                        </td>
                        <td className={`py-3 px-3 text-right font-mono text-xs
                          ${m.azk_bank_total < 0 ? 'text-red-500 font-medium' : 'text-foreground'}`}>
                          {`${sign(m.azk_bank_total)}h`}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs">
                          {m.has_data ? fmtEur(m.bonus_total) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs">
                          {m.has_data ? fmtEur(m.travel_total) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs">
                          {m.has_data ? fmtEur(m.gross_pay) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs font-semibold">
                          {m.has_data ? fmtEur(m.net_pay) : '—'}
                        </td>
                        <td className="py-3 pl-3 text-right font-mono text-xs font-bold text-primary">
                          {m.has_data ? fmtEur((m.final_payout ?? m.net_pay)) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr className="border-t-2 border-primary/30 bg-muted/20 font-semibold">
                      <td className="py-3 pr-4">Total ({totalMonths} months)</td>
                      <td className="py-3 px-3 text-right font-mono text-xs">{fmtHrs(data.total_worked_hours)}</td>
                      <td className="py-3 px-3 text-right font-mono text-xs">{fmtHrs(data.total_payable_hours)}</td>
                      <td className="py-3 px-3 text-right font-mono text-xs">—</td>
                      <td className={`py-3 px-3 text-right font-mono text-xs ${data.final_azk_bank < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {`${sign(data.final_azk_bank)}h`}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs">{fmtEur(data.total_bonus)}</td>
                      <td className="py-3 px-3 text-right font-mono text-xs">{fmtEur(data.total_travel)}</td>
                      <td className="py-3 px-3 text-right font-mono text-xs">{fmtEur(data.total_gross_pay)}</td>
                      <td className="py-3 px-3 text-right font-mono text-xs">{fmtEur(data.total_net_pay)}</td>
                      <td className="py-3 pl-3 text-right font-mono text-xs font-bold text-primary">{fmtEur(data.total_final_payout ?? data.total_net_pay)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}