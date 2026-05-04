import { useState, useEffect } from 'react';
import {
  FileText, Download, Mail, Calendar, Eye, Loader2,
  Send, Clock, Palmtree, Thermometer, TrendingUp, AlertTriangle, BookOpen
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { summaryApi, exportApi, emailApi, annualApi, autoEmailApi } from '../lib/api';
import { toast } from 'sonner';

const months = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
const currentYear  = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const fmt  = (n) => (n ?? 0).toFixed(2);
const sign = (n) => (n >= 0 ? '+' : '') + fmt(n);

export default function Payslip() {
  const [year,          setYear]          = useState(currentYear);
  const [month,         setMonth]         = useState(currentMonth);
  const [summary,       setSummary]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [downloading,   setDownloading]   = useState(false);
  const [showPreview,   setShowPreview]   = useState(false);
  const [recipientEmail,setRecipientEmail]= useState('');
  const [sending,       setSending]       = useState(false);
  const [autoSending,   setAutoSending]   = useState(false);
  const [annualYear,    setAnnualYear]    = useState(currentYear);
  const [annualDl,      setAnnualDl]      = useState(false);

  useEffect(() => { fetchSummary(); }, [year, month]);

  const fetchSummary = async () => {
    setLoading(true);
    try { const r = await summaryApi.get(year, month); setSummary(r.data); }
    catch { setSummary(null); } finally { setLoading(false); }
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const r = await exportApi.pdf(year, month);
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', `payslip_${year}_${String(month).padStart(2,'0')}.pdf`);
      document.body.appendChild(a); a.click(); a.remove();
      toast.success('Payslip downloaded');
    } catch { toast.error('Failed to download payslip'); }
    finally { setDownloading(false); }
  };

  const handleSendEmail = async () => {
    if (!recipientEmail) { toast.error('Please enter recipient email'); return; }
    setSending(true);
    try {
      await emailApi.send({ recipient_email: recipientEmail, year, month });
      toast.success('Email sent successfully');
      setRecipientEmail('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send. Check email settings.');
    } finally { setSending(false); }
  };

  const handleAutoSend = async () => {
    setAutoSending(true);
    try {
      const r = await autoEmailApi.trigger();
      if (r.data.sent) toast.success(r.data.message);
      else toast.info(r.data.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Auto-send failed. Check email settings.');
    } finally { setAutoSending(false); }
  };

  const handleAnnualPDF = async () => {
    setAnnualDl(true);
    try {
      const r = await annualApi.pdf(annualYear);
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', `annual_summary_${annualYear}.pdf`);
      document.body.appendChild(a); a.click(); a.remove();
      toast.success(`Annual summary for ${annualYear} downloaded`);
    } catch { toast.error('Failed to generate annual PDF'); }
    finally { setAnnualDl(false); }
  };

  // Reusable payslip body used in both the preview card and the full dialog
  const PayslipBody = () => {
    if (!summary) return (
      <div className="text-center py-12 text-muted-foreground">No data for this period</div>
    );
    return (
      <div className="space-y-0 text-sm">
        {/* Hours & AZK */}
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-3 pb-1">Hours & AZK</p>
        {[
          ['Total Worked Hours', `${fmt(summary.total_worked_hours)} hrs`, ''],
          ['Payable Hours',      `${fmt(summary.payable_hours)} hrs`, ''],
          ['AZK Change',         `${sign(summary.azk_change)} hrs`,
            summary.azk_change >= 0 ? 'text-emerald-600' : 'text-orange-600'],
          ['AZK Bank Balance',   `${fmt(summary.azk_bank_total)} hrs`,
            summary.azk_bank_total < 0 ? 'text-red-600 font-bold' :
            summary.azk_bank_total < 5 ? 'text-amber-600 font-semibold' : 'text-emerald-600'],
        ].map(([l, v, vc]) => (
          <div key={l} className="flex justify-between items-center py-1.5 border-b border-border/50">
            <span className="text-muted-foreground">{l}</span>
            <span className={`font-mono font-medium ${vc}`}>{v}</span>
          </div>
        ))}
        {summary.azk_bank_total < 0 && (
          <div className="flex items-center gap-2 my-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-400">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            AZK bank is negative — salary may be reduced next month
          </div>
        )}

        {/* Leave */}
        {(summary.vacation_days > 0 || summary.sick_days > 0) && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-4 pb-1">Leave This Month</p>
            {summary.vacation_days > 0 && (
              <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Palmtree className="w-3.5 h-3.5 text-emerald-500" /> Vacation Days Used
                </span>
                <span className="font-mono font-medium text-emerald-600">{summary.vacation_days}d</span>
              </div>
            )}
            {summary.sick_days > 0 && (
              <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Thermometer className="w-3.5 h-3.5 text-red-500" /> Sick Days
                </span>
                <span className="font-mono font-medium text-red-600">{summary.sick_days}d</span>
              </div>
            )}
          </>
        )}

        {/* Salary */}
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-4 pb-1">Salary</p>
        {[
          ['Base Pay (taxable)', `€${fmt(summary.gross_pay)}`,    ''],
          ['Tax',                `-€${fmt(summary.tax)}`,         'text-red-600'],
          ['Net Earned',         `€${fmt(summary.net_pay)}`,      'font-semibold'],
        ].map(([l, v, vc]) => (
          <div key={l} className="flex justify-between items-center py-1.5 border-b border-border/50">
            <span className={vc.includes('red') ? 'text-red-600' : 'text-muted-foreground'}>{l}</span>
            <span className={`font-mono ${vc}`}>{v}</span>
          </div>
        ))}

        {/* Post-tax tax-free additions */}
        {(summary.bonus_total > 0 || summary.travel_total > 0 || (summary.meal_total ?? 0) > 0) && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 pt-3 pb-1">Tax-Free Additions</p>
            {summary.bonus_total > 0 && (
              <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                <span className="text-emerald-600">Bonus (6+ hrs days)</span>
                <span className="font-mono text-emerald-600">+€{fmt(summary.bonus_total)}</span>
              </div>
            )}
            {summary.travel_total > 0 && (
              <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                <span className="text-emerald-600">Travel Allowance</span>
                <span className="font-mono text-emerald-600">+€{fmt(summary.travel_total)}</span>
              </div>
            )}
            {(summary.meal_total ?? 0) > 0 && (
              <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                <span className="text-emerald-600">Meal Allowance</span>
                <span className="font-mono text-emerald-600">+€{fmt(summary.meal_total)}</span>
              </div>
            )}
          </>
        )}

        {/* Final Payout highlight */}
        <div className="mt-4 -mx-6 px-6 py-4 bg-primary/10 border-t-2 border-primary/30 flex justify-between items-center rounded-b-lg">
          <span className="font-semibold text-lg">Final Payout</span>
          <span className="font-mono font-bold text-2xl text-primary">€{fmt(summary.final_payout ?? summary.net_pay)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in" data-testid="payslip-page">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">Payslip Generator</h1>
          <p className="text-muted-foreground mt-1">Generate, preview and send monthly payslips</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-36" data-testid="payslip-month-selector">
              <Calendar className="w-4 h-4 mr-2 opacity-50" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28" data-testid="payslip-year-selector"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Payslip Preview Card */}
        <Card data-testid="payslip-preview-card">
          <CardHeader>
            <CardTitle className="font-heading flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Payslip Preview
            </CardTitle>
            <CardDescription>{months[month-1]} {year}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading
              ? <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              : <PayslipBody />
            }
            {!loading && (
              <div className="mt-6 flex gap-3">
                <Button onClick={handleDownloadPDF} disabled={downloading || !summary} className="flex-1"
                  data-testid="download-pdf-btn">
                  {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Download PDF
                </Button>
                <Button variant="outline" onClick={() => setShowPreview(true)} disabled={!summary}
                  data-testid="preview-btn">
                  <Eye className="w-4 h-4 mr-2" /> Preview
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column: email + automation + annual */}
        <div className="space-y-4">

          {/* Manual send */}
          <Card data-testid="email-card">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2 text-base">
                <Mail className="w-4 h-4 text-primary" /> Send by Email
              </CardTitle>
              <CardDescription>Send {months[month-1]} {year} payslip PDF to any address</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Recipient Email</Label>
                <Input type="email" placeholder="you@example.com"
                  value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
                  data-testid="recipient-email-input" />
              </div>
              <Button onClick={handleSendEmail} disabled={sending || !recipientEmail || !summary} className="w-full"
                data-testid="send-email-btn">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send Payslip Email
              </Button>
            </CardContent>
          </Card>

          {/* Auto-send */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2 text-base">
                <Clock className="w-4 h-4 text-primary" /> Monthly Auto-Send
              </CardTitle>
              <CardDescription>
                Sends last month's payslip to your own email on the configured day
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={handleAutoSend} disabled={autoSending} variant="outline" className="w-full">
                {autoSending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <TrendingUp className="w-4 h-4 mr-2" />}
                {autoSending ? 'Checking…' : 'Trigger Auto-Send Now'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Only sends if today matches the Auto Email Day in Settings. Safe to click any time — it will tell you if it's not the send day.
              </p>
            </CardContent>
          </Card>

          {/* Annual PDF */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2 text-base">
                <BookOpen className="w-4 h-4 text-primary" /> Year-End Summary PDF
              </CardTitle>
              <CardDescription>One-page table of all 12 months — hours, AZK, leave, salary</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 items-end">
                <div className="space-y-1 flex-1">
                  <Label>Year</Label>
                  <Select value={String(annualYear)} onValueChange={v => setAnnualYear(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAnnualPDF} disabled={annualDl}>
                  {annualDl ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Download
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Work Entries Table */}
      {summary?.entries?.length > 0 && (
        <Card data-testid="payslip-entries-card">
          <CardHeader>
            <CardTitle className="font-heading">Work Entries — {months[month-1]} {year}</CardTitle>
            <CardDescription>{summary.entries.length} entries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Start</th><th>End</th><th>Break</th>
                    <th>Hours</th><th>Holiday</th><th>Travel</th>
                    <th>Bonus</th><th>Gross</th><th>Tax</th><th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.entries.map(e => (
                    <tr key={e.id}>
                      <td className="font-mono text-xs">{e.date}</td>
                      <td className="font-mono text-xs">{e.start_time}</td>
                      <td className="font-mono text-xs">{e.end_time}</td>
                      <td className="font-mono text-xs">{e.break_hours}h</td>
                      <td className="font-mono text-xs font-medium">{e.working_hours}h</td>
                      <td className="text-center text-xs">
                        {e.is_public_holiday
                          ? <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-full text-xs">PH</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="font-mono text-xs">€{e.travel_allowance.toFixed(2)}</td>
                      <td className="font-mono text-xs">€{(e.meal_allowance||0).toFixed(2)}</td>
                      <td className="font-mono text-xs">€{e.bonus.toFixed(2)}</td>
                      <td className="font-mono text-xs">€{e.gross_pay.toFixed(2)}</td>
                      <td className="font-mono text-xs text-red-600">€{e.tax.toFixed(2)}</td>
                      <td className="font-mono text-xs font-medium text-primary">€{e.net_pay.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-semibold text-xs">
                    <td colSpan={4}>Totals</td>
                    <td className="font-mono">{fmt(summary.total_worked_hours)}h</td>
                    <td />
                    <td className="font-mono">€{fmt(summary.travel_total)}</td>
                    <td className="font-mono">€{fmt(summary.meal_total ?? 0)}</td>
                    <td className="font-mono">€{fmt(summary.bonus_total)}</td>
                    <td className="font-mono">€{fmt(summary.gross_pay)}</td>
                    <td className="font-mono text-red-600">€{fmt(summary.tax)}</td>
                    <td className="font-mono text-primary">€{fmt(summary.net_pay)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Full Payslip Preview</DialogTitle>
            <DialogDescription>{months[month-1]} {year}</DialogDescription>
          </DialogHeader>
          {summary && (
            <div className="border border-border rounded-lg px-6 pb-0 bg-card">
              <div className="text-center border-b border-border py-4 mb-1">
                <h2 className="text-xl font-heading font-bold">MUL Company</h2>
                <p className="text-muted-foreground text-sm">Official Payslip · {months[month-1]} {year}</p>
              </div>
              <PayslipBody />
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}