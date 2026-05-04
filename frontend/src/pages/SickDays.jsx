import { useState, useEffect } from 'react';
import { Thermometer, Plus, Trash2, Calendar, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { sickDaysApi } from '../lib/api';
import { toast } from 'sonner';

const currentYear = new Date().getFullYear();
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

export default function SickDays() {
  const [entries, setEntries]   = useState([]);
  const [summary, setSummary]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [year, setYear]         = useState(currentYear);

  const [newDate,  setNewDate]  = useState('');
  const [newDays,  setNewDays]  = useState('1');
  const [newNotes, setNewNotes] = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => { fetchAll(); }, [year]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [entRes, sumRes] = await Promise.all([
        sickDaysApi.getAll(year),
        sickDaysApi.summary(year),
      ]);
      setEntries(entRes.data);
      setSummary(sumRes.data);
    } catch {
      toast.error('Failed to load sick days');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newDate) { toast.error('Please select a date'); return; }
    const days = parseFloat(newDays);
    if (isNaN(days) || days <= 0) { toast.error('Days must be positive'); return; }
    setSaving(true);
    try {
      await sickDaysApi.add({ date: newDate, days, notes: newNotes });
      toast.success('Sick day recorded');
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
      await sickDaysApi.delete(id);
      toast.success('Entry removed');
      fetchAll();
    } catch { toast.error('Failed to delete'); }
  };

  // Group by month
  const byMonth = MONTH_NAMES.reduce((acc, name, i) => {
    const mes = entries.filter(e => e.month === i + 1);
    if (mes.length) acc.push({ month: i + 1, name, entries: mes });
    return acc;
  }, []);

  const totalDays = summary?.total ?? entries.reduce((s, e) => s + e.days, 0);

  return (
    <div className="space-y-6 animate-in" data-testid="sick-days-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground flex items-center gap-2">
            <Thermometer className="w-7 h-7 text-red-500" />
            Sick Days
          </h1>
          <p className="text-muted-foreground mt-1">Track your sick leave days</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setYear(y => y - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="w-16 text-center font-heading font-bold text-lg">{year}</span>
          <Button variant="outline" size="icon" onClick={() => setYear(y => y + 1)} disabled={year >= currentYear}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={fetchAll}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="card-hover">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground font-medium">Total Sick Days {year}</p>
            <p className="text-4xl font-heading font-bold font-mono mt-2 text-red-500">{totalDays}</p>
            <p className="text-xs text-muted-foreground mt-1">days taken</p>
          </CardContent>
        </Card>
        {/* Per-month breakdown mini cards */}
        {summary?.by_month && Object.keys(summary.by_month).length > 0 && (
          <Card className="sm:col-span-2">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-muted-foreground mb-3">Monthly Breakdown</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.by_month).map(([m, d]) => (
                  <span key={m} className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2.5 py-1 rounded-full font-medium">
                    {MONTH_NAMES[parseInt(m) - 1].slice(0, 3)}: {d}d
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add entry */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" /> Record Sick Day
          </CardTitle>
          <CardDescription>Sick days are tracked separately and shown on your payslip</CardDescription>
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
            <div className="space-y-1 lg:col-span-2">
              <Label>Notes (optional)</Label>
              <Input placeholder="e.g. Flu, doctor visit..." value={newNotes} onChange={e => setNewNotes(e.target.value)} />
            </div>
          </div>
          <Button className="mt-4" onClick={handleAdd} disabled={saving}>
            <Plus className="w-4 h-4 mr-2" />
            {saving ? 'Saving…' : 'Record Sick Day'}
          </Button>
        </CardContent>
      </Card>

      {/* Entries list */}
      {loading ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Loading…</CardContent></Card>
      ) : entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Thermometer className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No sick days recorded for {year}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">{year} — {totalDays} day{totalDays !== 1 ? 's' : ''} total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 px-3 font-medium">Day</th>
                    <th className="py-2 px-3 font-medium text-center">Days</th>
                    <th className="py-2 px-3 font-medium">Notes</th>
                    <th className="py-2 pl-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {byMonth.map(({ month, name, entries: mes }) => (
                    <>
                      <tr key={`m-${month}`}>
                        <td colSpan={5} className="pt-4 pb-1">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {name} — {mes.reduce((s,e) => s+e.days, 0)}d
                          </span>
                        </td>
                      </tr>
                      {mes.map(entry => {
                        const d = new Date(entry.date + 'T00:00:00');
                        return (
                          <tr key={entry.id} className="border-b border-border/40 hover:bg-muted/20">
                            <td className="py-2.5 pr-4 font-mono text-xs">{entry.date}</td>
                            <td className="py-2.5 px-3 text-xs text-muted-foreground">
                              {d.toLocaleDateString('en-GB', { weekday: 'long' })}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                                {entry.days}d
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-xs text-muted-foreground">{entry.notes || '—'}</td>
                            <td className="py-2.5 pl-3">
                              <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-500"
                                onClick={() => handleDelete(entry.id)}>
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