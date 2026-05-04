import { useState, useEffect } from 'react';
import {
  Palmtree, Plus, Trash2, Calendar, RefreshCw, Settings2, ChevronDown, ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { vacationApi } from '../lib/api';
import { toast } from 'sonner';

const currentYear = new Date().getFullYear();
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// Small progress bar component
function ProgressBar({ used, total }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Vacation() {
  const [entries, setEntries]     = useState([]);
  const [balances, setBalances]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterYear, setFilterYear] = useState(currentYear);

  // New entry form
  const [newDate,        setNewDate]        = useState('');
  const [newDays,        setNewDays]        = useState('1');
  const [newBalanceYear, setNewBalanceYear] = useState(String(currentYear));
  const [newNotes,       setNewNotes]       = useState('');
  const [saving,         setSaving]         = useState(false);

  // Balance editor
  const [showBalanceEditor, setShowBalanceEditor] = useState(false);
  const [editBalanceYear,   setEditBalanceYear]   = useState(String(currentYear));
  const [editEntitlement,   setEditEntitlement]   = useState('');
  const [savingBalance,     setSavingBalance]     = useState(false);

  useEffect(() => { fetchAll(); }, [filterYear]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [entRes, balRes] = await Promise.all([
        vacationApi.getEntries(filterYear),
        vacationApi.getBalances(),
      ]);
      setEntries(entRes.data);
      setBalances(balRes.data);
    } catch {
      toast.error('Failed to load vacation data');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newDate || !newDays || !newBalanceYear) {
      toast.error('Please fill in date, days and balance year');
      return;
    }
    const days = parseFloat(newDays);
    if (isNaN(days) || days <= 0) {
      toast.error('Days must be a positive number');
      return;
    }
    setSaving(true);
    try {
      await vacationApi.addEntry({
        date:         newDate,
        days,
        balance_year: parseInt(newBalanceYear),
        notes:        newNotes,
      });
      toast.success('Vacation day added');
      setNewDate(''); setNewDays('1'); setNewNotes('');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await vacationApi.deleteEntry(id);
      toast.success('Entry deleted');
      fetchAll();
    } catch {
      toast.error('Failed to delete entry');
    }
  };

  const handleSaveBalance = async () => {
    const days = parseFloat(editEntitlement);
    if (isNaN(days) || days <= 0) { toast.error('Enter a valid number of days'); return; }
    setSavingBalance(true);
    try {
      await vacationApi.setBalance(parseInt(editBalanceYear), days);
      toast.success(`${editBalanceYear} entitlement set to ${days} days`);
      setEditEntitlement('');
      fetchAll();
    } catch {
      toast.error('Failed to save balance');
    } finally {
      setSavingBalance(false);
    }
  };

  // Group entries by month for display
  const byMonth = MONTH_NAMES.reduce((acc, name, i) => {
    const m = i + 1;
    const monthEntries = entries.filter(e => e.month === m);
    if (monthEntries.length > 0) acc.push({ month: m, name, entries: monthEntries });
    return acc;
  }, []);

  const totalUsedThisYear = entries.reduce((s, e) => s + e.days, 0);

  return (
    <div className="space-y-6 animate-in" data-testid="vacation-page">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground flex items-center gap-2">
            <Palmtree className="w-7 h-7 text-emerald-500" />
            Paid Vacation
          </h1>
          <p className="text-muted-foreground mt-1">Track your vacation days and remaining balance</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(filterYear)} onValueChange={v => setFilterYear(parseInt(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchAll}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Balance Cards */}
      {balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map(b => (
            <Card key={b.balance_year} className="card-hover">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    {b.balance_year} Entitlement
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    b.remaining <= 0
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : b.remaining <= 5
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  }`}>
                    {b.remaining} left
                  </span>
                </div>
                <div className="text-3xl font-heading font-bold font-mono text-foreground mb-1">
                  {b.used} <span className="text-lg text-muted-foreground font-normal">/ {b.total_entitlement} days</span>
                </div>
                <ProgressBar used={b.used} total={b.total_entitlement} />
                <p className="text-xs text-muted-foreground mt-2">{b.used} used · {b.remaining} remaining</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {balances.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Palmtree className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No vacation balances configured yet</p>
            <p className="text-sm mt-1">Use the "Configure Entitlement" panel below to set your yearly allowance.</p>
          </CardContent>
        </Card>
      )}

      {/* Configure Entitlement (collapsible) */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setShowBalanceEditor(v => !v)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading flex items-center gap-2 text-base">
              <Settings2 className="w-4 h-4 text-primary" />
              Configure Yearly Entitlement
            </CardTitle>
            {showBalanceEditor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
          <CardDescription>Set or update how many paid vacation days you are entitled to per year</CardDescription>
        </CardHeader>
        {showBalanceEditor && (
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="space-y-1 flex-1">
                <Label>Year</Label>
                <Select value={editBalanceYear} onValueChange={setEditBalanceYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 flex-1">
                <Label>Total entitlement (days)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="e.g. 26"
                  value={editEntitlement}
                  onChange={e => setEditEntitlement(e.target.value)}
                />
              </div>
              <Button onClick={handleSaveBalance} disabled={savingBalance}>
                {savingBalance ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Example: For 2025 carry-over of 16 days, set 2025 = 16. For 2026 entitlement of 26 days, set 2026 = 26.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Add Vacation Entry */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Add Vacation Day
          </CardTitle>
          <CardDescription>Record a vacation day and which year's entitlement it uses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Days</Label>
              <Select value={newDays} onValueChange={setNewDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 full day</SelectItem>
                  <SelectItem value="0.5">0.5 half day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Draws from year</Label>
              <Select value={newBalanceYear} onValueChange={setNewBalanceYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <SelectItem key={y} value={String(y)}>{y} entitlement</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Input placeholder="e.g. Summer holiday" value={newNotes} onChange={e => setNewNotes(e.target.value)} />
            </div>
          </div>
          <Button className="mt-4" onClick={handleAdd} disabled={saving}>
            <Plus className="w-4 h-4 mr-2" />
            {saving ? 'Adding…' : 'Add Vacation Day'}
          </Button>
        </CardContent>
      </Card>

      {/* Entries by month */}
      {loading ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Loading…</CardContent></Card>
      ) : entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No vacation days recorded for {filterYear}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">
              {filterYear} — {totalUsedThisYear} day{totalUsedThisYear !== 1 ? 's' : ''} recorded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 px-3 font-medium">Day</th>
                    <th className="py-2 px-3 font-medium text-center">Days</th>
                    <th className="py-2 px-3 font-medium">From balance</th>
                    <th className="py-2 px-3 font-medium">Notes</th>
                    <th className="py-2 pl-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {byMonth.map(({ month, name, entries: mes }) => (
                    <>
                      <tr key={`month-${month}`}>
                        <td colSpan={6} className="pt-4 pb-1">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {name} — {mes.reduce((s, e) => s + e.days, 0)} day{mes.reduce((s,e)=>s+e.days,0)!==1?'s':''}
                          </span>
                        </td>
                      </tr>
                      {mes.map(entry => {
                        const d = new Date(entry.date + 'T00:00:00');
                        const dayName = d.toLocaleDateString('en-GB', { weekday: 'long' });
                        return (
                          <tr key={entry.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                            <td className="py-2.5 pr-4 font-mono text-xs">{entry.date}</td>
                            <td className="py-2.5 px-3 text-xs text-muted-foreground">{dayName}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                                {entry.days}d
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-xs">
                              <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded-full text-xs font-medium">
                                {entry.balance_year}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-xs text-muted-foreground">{entry.notes || '—'}</td>
                            <td className="py-2.5 pl-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 text-muted-foreground hover:text-red-500"
                                onClick={() => handleDelete(entry.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}