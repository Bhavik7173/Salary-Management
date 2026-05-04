from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, date
import io
import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="MUL Salary Tracker API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Constants
DEFAULT_HOURLY_RATE      = 14.96
DEFAULT_CONTRACT_HOURS   = 151.67
DEFAULT_TAX_RATE         = 0.2764
DEFAULT_DAILY_STD_HOURS  = 7.42   # per absent PH & vacation day
BONUS_THRESHOLD_HOURS    = 6
BONUS_AMOUNT             = 6.0

# ============= MODELS =============

class WorkEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    break_hours: float = 0.0
    travel_allowance: float = 0.0
    meal_allowance: float = 0.0
    is_public_holiday: bool = False
    notes: str = ""
    working_hours: float = 0.0
    bonus: float = 0.0
    gross_pay: float = 0.0
    tax: float = 0.0
    net_pay: float = 0.0
    final_payout: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class WorkEntryCreate(BaseModel):
    date: str
    start_time: str
    end_time: str
    break_hours: float = 0.0
    travel_allowance: float = 0.0
    meal_allowance: float = 0.0
    is_public_holiday: bool = False
    notes: str = ""

class WorkEntryUpdate(BaseModel):
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    break_hours: Optional[float] = None
    travel_allowance: Optional[float] = None
    meal_allowance: Optional[float] = None
    is_public_holiday: Optional[bool] = None
    notes: Optional[str] = None

class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "settings"
    hourly_rate: float = DEFAULT_HOURLY_RATE
    contract_hours: float = DEFAULT_CONTRACT_HOURS
    tax_rate: float = DEFAULT_TAX_RATE
    company_name: str = "MUL Company"
    company_logo: Optional[str] = None
    email_address: str = ""
    email_password: str = ""
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    auto_email_day: int = 1
    dark_mode: bool = False
    manual_azk_adjustment: float = 0.0  # Manual AZK bank adjustment
    daily_standard_hours: float = DEFAULT_DAILY_STD_HOURS  # Per absent PH & vacation day

class SettingsUpdate(BaseModel):
    hourly_rate: Optional[float] = None
    contract_hours: Optional[float] = None
    tax_rate: Optional[float] = None
    company_name: Optional[str] = None
    company_logo: Optional[str] = None
    email_address: Optional[str] = None
    email_password: Optional[str] = None
    smtp_server: Optional[str] = None
    smtp_port: Optional[int] = None
    auto_email_day: Optional[int] = None
    manual_azk_adjustment: Optional[float] = None
    daily_standard_hours: Optional[float] = None
    dark_mode: Optional[bool] = None

class MonthlySummary(BaseModel):
    year: int
    month: int
    total_worked_hours: float
    payable_hours: float
    azk_change: float
    azk_bank_total: float
    gross_pay: float
    tax: float
    bonus_total: float
    travel_total: float
    meal_total: float
    vacation_days: float
    sick_days: float
    net_pay: float
    final_payout: float
    entries: List[WorkEntry]
    daily_hours: List[dict]

class EmailRequest(BaseModel):
    recipient_email: str
    year: int
    month: int

# ============= HELPER FUNCTIONS =============

def calculate_working_hours(start_time: str, end_time: str, break_hours: float) -> float:
    """Calculate working hours from start and end time minus breaks."""
    try:
        start = datetime.strptime(start_time, "%H:%M")
        end = datetime.strptime(end_time, "%H:%M")
        if end < start:
            # Handle overnight shifts
            end = end.replace(day=2)
            start = start.replace(day=1)
        total_hours = (end - start).seconds / 3600
        working_hours = max(0, total_hours - break_hours)
        return round(working_hours, 2)
    except:
        return 0.0

async def get_settings() -> Settings:
    """Get settings from database or return defaults."""
    settings_doc = await db.settings.find_one({"id": "settings"}, {"_id": 0})
    if settings_doc:
        return Settings(**settings_doc)
    return Settings()

def calculate_entry_pay(entry_data: dict, settings: Settings) -> dict:
    """Calculate pay for one work entry.

    Matches real German payslip structure:
      gross      = working_hours × hourly_rate          (taxable base only)
      tax        = gross × tax_rate
      net_earned = gross - tax
      final      = net_earned + bonus + travel + meal   (all post-tax, tax-free)

    Public holiday absent entries (working_hours=0) have no gross/tax/bonus.
    The AZK credit for those days is handled in get_monthly_summary.
    """
    working_hours = calculate_working_hours(
        entry_data.get("start_time", "00:00"),
        entry_data.get("end_time", "00:00"),
        entry_data.get("break_hours", 0)
    )

    bonus  = BONUS_AMOUNT if working_hours >= BONUS_THRESHOLD_HOURS else 0.0
    travel = float(entry_data.get("travel_allowance", 0) or 0)
    meal   = float(entry_data.get("meal_allowance",   0) or 0)

    gross_pay = round(working_hours * settings.hourly_rate, 2)   # taxable only
    tax       = round(gross_pay * settings.tax_rate, 2)
    net_pay   = round(gross_pay - tax, 2)                         # after-tax base
    final_payout = round(net_pay + bonus + travel + meal, 2)      # add tax-free items

    return {
        "working_hours": round(working_hours, 2),
        "bonus":         round(bonus, 2),
        "gross_pay":     gross_pay,
        "tax":           tax,
        "net_pay":       net_pay,
        "final_payout":  final_payout,
    }

async def get_azk_bank_total(exclude_year: int = None, exclude_month: int = None) -> float:
    """Calculate cumulative AZK bank balance from all months except the excluded one.

    For each month:
      effective = worked_hours
                + absent_public_holidays × daily_standard_hours
                + vacation_days × daily_standard_hours
      azk_change = effective - contract_hours
    """
    settings = await get_settings()

    # Sum worked hours and absent PH count per month from work_entries
    pipeline = [
        {"$group": {
            "_id": {
                "year":  {"$year":  {"$dateFromString": {"dateString": "$date"}}},
                "month": {"$month": {"$dateFromString": {"dateString": "$date"}}}
            },
            "worked_hours":    {"$sum": "$working_hours"},
            "absent_holidays": {"$sum": {
                "$cond": [
                    {"$and": [
                        {"$eq": ["$is_public_holiday", True]},
                        {"$eq": ["$working_hours", 0]}
                    ]},
                    1, 0
                ]
            }},
        }}
    ]
    cursor = db.work_entries.aggregate(pipeline)
    results = await cursor.to_list(200)

    azk_total = 0.0
    for r in results:
        yr  = r["_id"]["year"]
        mo  = r["_id"]["month"]
        if exclude_year and exclude_month:
            if yr == exclude_year and mo == exclude_month:
                continue

        ph_credit  = r["absent_holidays"] * settings.daily_standard_hours

        # Vacation hours for this month (safe if collection missing)
        try:
            vac_cursor = db.vacation_entries.find({"year": yr, "month": mo})
            vac_list   = await vac_cursor.to_list(100)
        except Exception:
            vac_list = []
        vac_hours = sum(v.get("days", 0) for v in vac_list) * settings.daily_standard_hours

        effective  = r["worked_hours"] + ph_credit + vac_hours
        azk_total += effective - settings.contract_hours

    azk_total += settings.manual_azk_adjustment
    return round(azk_total, 2)

# ============= WORK ENTRIES ROUTES =============

@api_router.get("/")
async def root():
    return {"message": "MUL Salary Tracker API"}

@api_router.post("/entries", response_model=WorkEntry)
async def create_work_entry(entry: WorkEntryCreate):
    """Create a new work entry."""
    settings = await get_settings()
    
    entry_dict = entry.model_dump()
    pay_data = calculate_entry_pay(entry_dict, settings)
    
    work_entry = WorkEntry(
        **entry_dict,
        **pay_data
    )
    
    doc = work_entry.model_dump()
    await db.work_entries.insert_one(doc)
    return work_entry

@api_router.get("/entries", response_model=List[WorkEntry])
async def get_work_entries(year: Optional[int] = None, month: Optional[int] = None):
    """Get all work entries, optionally filtered by year and month."""
    query = {}
    
    if year and month:
        # Filter by year-month prefix
        month_str = f"{year}-{month:02d}"
        query["date"] = {"$regex": f"^{month_str}"}
    
    entries = await db.work_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return entries

@api_router.get("/entries/{entry_id}", response_model=WorkEntry)
async def get_work_entry(entry_id: str):
    """Get a single work entry by ID."""
    entry = await db.work_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry

@api_router.put("/entries/{entry_id}", response_model=WorkEntry)
async def update_work_entry(entry_id: str, update: WorkEntryUpdate):
    """Update a work entry."""
    entry = await db.work_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_dict:
        entry.update(update_dict)
        settings = await get_settings()
        pay_data = calculate_entry_pay(entry, settings)
        entry.update(pay_data)
        entry["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.work_entries.update_one(
            {"id": entry_id},
            {"$set": entry}
        )
    
    return WorkEntry(**entry)

@api_router.delete("/entries/{entry_id}")
async def delete_work_entry(entry_id: str):
    """Delete a work entry."""
    result = await db.work_entries.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Entry deleted successfully"}

# ============= MONTHLY SUMMARY ROUTE =============

@api_router.get("/summary/{year}/{month}", response_model=MonthlySummary)
async def get_monthly_summary(year: int, month: int):
    """Get monthly summary — matches real German payslip logic exactly.

    effective_hours = worked + absent_PH_credit + vacation_credit
    gross    = payable_hours × hourly_rate   (taxable only)
    tax      = gross × tax_rate
    net      = gross - tax
    final    = net + bonus_total + travel_total + meal_total  (post-tax)
    """
    settings  = await get_settings()
    month_str = f"{year}-{month:02d}"

    entries = await db.work_entries.find(
        {"date": {"$regex": f"^{month_str}"}},
        {"_id": 0}
    ).sort("date", 1).to_list(200)

    # ── effective hours per entry ──────────────────────────────
    def effective_hours(e: dict) -> float:
        """Absent public holiday → credit daily_standard_hours (not penalised)."""
        if e.get("is_public_holiday", False) and e.get("working_hours", 0) == 0:
            return settings.daily_standard_hours
        return e.get("working_hours", 0)

    worked_hours = sum(effective_hours(e) for e in entries)

    # ── vacation credit ────────────────────────────────────────
    vac_cursor  = db.vacation_entries.find({"year": year, "month": month})
    vac_entries = await vac_cursor.to_list(100)
    vacation_days  = round(sum(v.get("days", 0) for v in vac_entries), 2)
    vacation_hours = round(vacation_days * settings.daily_standard_hours, 2)

    # ── sick days ──────────────────────────────────────────────
    sick_cursor  = db.sick_days.find({"year": year, "month": month})         if hasattr(db, "sick_days") else None
    sick_entries = await sick_cursor.to_list(100) if sick_cursor else []
    sick_days    = round(sum(s.get("days", 0) for s in sick_entries), 2)

    # ── totals ─────────────────────────────────────────────────
    total_hours = round(worked_hours + vacation_hours, 2)
    azk_change  = round(total_hours - settings.contract_hours, 2)
    azk_bank    = await get_azk_bank_total(year, month)
    azk_bank_total = round(azk_bank + azk_change, 2)

    # Payable hours: always contract_hours unless bank is exhausted
    if azk_change < 0 and azk_bank_total < 0:
        payable_hours = round(settings.contract_hours + azk_bank_total, 2)
    else:
        payable_hours = settings.contract_hours

    # ── salary (matches payslip structure) ─────────────────────
    # Only count bonus/travel/meal for days actually worked (not absent PH days)
    bonus_total  = round(sum(e.get("bonus", 0)            for e in entries if e.get("working_hours", 0) > 0), 2)
    travel_total = round(sum(e.get("travel_allowance", 0) for e in entries), 2)
    meal_total   = round(sum(e.get("meal_allowance", 0)   for e in entries), 2)

    gross_pay    = round(payable_hours * settings.hourly_rate, 2)  # taxable only
    tax          = round(gross_pay * settings.tax_rate, 2)
    net_pay      = round(gross_pay - tax, 2)                        # after-tax base
    final_payout = round(net_pay + bonus_total + travel_total + meal_total, 2)

    # ── daily chart data ───────────────────────────────────────
    daily_hours = [
        {
            "date":              e["date"],
            "hours":             effective_hours(e),
            "is_public_holiday": e.get("is_public_holiday", False),
            "day":               e["date"][-2:]
        }
        for e in entries
    ]

    return MonthlySummary(
        year=year,
        month=month,
        total_worked_hours=round(worked_hours, 2),
        payable_hours=round(payable_hours, 2),
        azk_change=round(azk_change, 2),
        azk_bank_total=round(azk_bank_total, 2),
        gross_pay=round(gross_pay, 2),
        tax=round(tax, 2),
        bonus_total=round(bonus_total, 2),
        travel_total=round(travel_total, 2),
        meal_total=round(meal_total, 2),
        vacation_days=vacation_days,
        sick_days=sick_days,
        net_pay=round(net_pay, 2),
        final_payout=round(final_payout, 2),
        entries=[WorkEntry(**e) for e in entries],
        daily_hours=daily_hours
    )

# ============= YEARLY SUMMARY ROUTE =============

class MonthRow(BaseModel):
    month: int
    month_name: str
    total_worked_hours: float
    payable_hours: float
    azk_change: float
    azk_bank_total: float
    gross_pay: float
    tax: float
    bonus_total: float
    travel_total: float
    meal_total: float = 0.0
    vacation_days: float = 0.0
    sick_days: float = 0.0
    net_pay: float
    final_payout: float = 0.0
    has_data: bool

class YearlySummary(BaseModel):
    year: int
    months: List[MonthRow]
    total_worked_hours: float
    total_payable_hours: float
    total_gross_pay: float
    total_tax: float
    total_bonus: float
    total_travel: float
    total_meal: float
    total_net_pay: float
    total_final_payout: float
    final_azk_bank: float

MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
]

@api_router.get("/summary/{year}", response_model=YearlySummary)
async def get_yearly_summary(year: int):
    """Yearly overview — one row per month, all 12 months."""
    settings = await get_settings()
    months_data = []

    # Running AZK bank before this year
    pipeline_pre = [
        {"$match": {"date": {"$not": {"$regex": f"^{year}-"}}}},
        {"$group": {
            "_id": {
                "year":  {"$year":  {"$dateFromString": {"dateString": "$date"}}},
                "month": {"$month": {"$dateFromString": {"dateString": "$date"}}}
            },
            "worked_hours":    {"$sum": "$working_hours"},
            "absent_holidays": {"$sum": {"$cond": [
                {"$and": [{"$eq": ["$is_public_holiday", True]}, {"$eq": ["$working_hours", 0]}]},
                1, 0
            ]}},
        }}
    ]
    pre_results = await db.work_entries.aggregate(pipeline_pre).to_list(200)
    azk_running = 0.0
    for r in pre_results:
        try:
            vac_cur = db.vacation_entries.find({"year": r["_id"]["year"], "month": r["_id"]["month"]})
            vac_l   = await vac_cur.to_list(100)
        except Exception:
            vac_l = []
        vac_h = sum(v.get("days", 0) for v in vac_l) * settings.daily_standard_hours
        ph_h  = r["absent_holidays"] * settings.daily_standard_hours
        azk_running += (r["worked_hours"] + ph_h + vac_h) - settings.contract_hours
    azk_running += settings.manual_azk_adjustment

    # Per-month pipeline for this year
    pipeline = [
        {"$match": {"date": {"$regex": f"^{year}-"}}},
        {"$group": {
            "_id": {"$month": {"$dateFromString": {"dateString": "$date"}}},
            "worked_hours":    {"$sum": "$working_hours"},
            "bonus_total":     {"$sum": "$bonus"},
            "travel_total":    {"$sum": "$travel_allowance"},
            "meal_total":      {"$sum": "$meal_allowance"},
            "absent_holidays": {"$sum": {"$cond": [
                {"$and": [{"$eq": ["$is_public_holiday", True]}, {"$eq": ["$working_hours", 0]}]},
                1, 0
            ]}},
        }},
        {"$sort": {"_id": 1}}
    ]
    raw = {r["_id"]: r async for r in db.work_entries.aggregate(pipeline)}

    for m in range(1, 13):
        if m in raw:
            r = raw[m]
            # Vacation + PH credit
            try:
                vac_cur = db.vacation_entries.find({"year": year, "month": m})
                vac_l   = await vac_cur.to_list(100)
            except Exception:
                vac_l = []
            try:
                sick_cur = db.sick_days.find({"year": year, "month": m})
                sick_l   = await sick_cur.to_list(100)
            except Exception:
                sick_l = []
            vac_days  = round(sum(v.get("days", 0) for v in vac_l), 2)
            sick_days = round(sum(s.get("days", 0) for s in sick_l), 2)
            vac_h     = vac_days * settings.daily_standard_hours
            ph_h      = r["absent_holidays"] * settings.daily_standard_hours

            total_h   = round(r["worked_hours"] + ph_h + vac_h, 2)
            azk_change = round(total_h - settings.contract_hours, 2)
            azk_running = round(azk_running + azk_change, 2)

            if azk_change < 0 and azk_running < 0:
                payable = round(settings.contract_hours + azk_running, 2)
            else:
                payable = settings.contract_hours

            bonus_t  = round(r["bonus_total"], 2)
            travel_t = round(r["travel_total"], 2)
            meal_t   = round(r.get("meal_total", 0), 2)
            gross    = round(payable * settings.hourly_rate, 2)
            tax      = round(gross * settings.tax_rate, 2)
            net      = round(gross - tax, 2)
            final    = round(net + bonus_t + travel_t + meal_t, 2)

            months_data.append(MonthRow(
                month=m, month_name=MONTH_NAMES[m-1],
                total_worked_hours=round(r["worked_hours"], 2),
                payable_hours=payable,
                azk_change=azk_change, azk_bank_total=azk_running,
                gross_pay=gross, tax=tax,
                bonus_total=bonus_t, travel_total=travel_t, meal_total=meal_t,
                vacation_days=vac_days, sick_days=sick_days,
                net_pay=net, final_payout=final, has_data=True
            ))
        else:
            months_data.append(MonthRow(
                month=m, month_name=MONTH_NAMES[m-1],
                total_worked_hours=0, payable_hours=0,
                azk_change=0, azk_bank_total=round(azk_running, 2),
                gross_pay=0, tax=0, bonus_total=0,
                travel_total=0, meal_total=0, vacation_days=0, sick_days=0,
                net_pay=0, final_payout=0, has_data=False
            ))

    active = [mo for mo in months_data if mo.has_data]
    return YearlySummary(
        year=year, months=months_data,
        total_worked_hours=round(sum(m.total_worked_hours for m in active), 2),
        total_payable_hours=round(sum(m.payable_hours for m in active), 2),
        total_gross_pay=round(sum(m.gross_pay for m in active), 2),
        total_tax=round(sum(m.tax for m in active), 2),
        total_bonus=round(sum(m.bonus_total for m in active), 2),
        total_travel=round(sum(m.travel_total for m in active), 2),
        total_meal=round(sum(m.meal_total for m in active), 2),
        total_net_pay=round(sum(m.net_pay for m in active), 2),
        total_final_payout=round(sum(m.final_payout for m in active), 2),
        final_azk_bank=months_data[-1].azk_bank_total if months_data else 0,
    )

# ============= VACATION ROUTES =============

class VacationEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    year: int
    month: int
    days: float
    balance_year: int
    notes: str = ""

class VacationEntryCreate(BaseModel):
    date: str
    days: float
    balance_year: int
    notes: str = ""

class VacationBalance(BaseModel):
    balance_year: int
    total_entitlement: float
    used: float
    remaining: float

@api_router.get("/vacation/balance", response_model=List[VacationBalance])
async def get_vacation_balances():
    cursor = db.vacation_balances.find({})
    balances = await cursor.to_list(50)
    result = []
    for b in balances:
        used_cursor = db.vacation_entries.aggregate([
            {"$match": {"balance_year": b["balance_year"]}},
            {"$group": {"_id": None, "total": {"$sum": "$days"}}}
        ])
        used_list = await used_cursor.to_list(1)
        used = round(used_list[0]["total"] if used_list else 0.0, 1)
        result.append(VacationBalance(
            balance_year=b["balance_year"],
            total_entitlement=b["total_entitlement"],
            used=used,
            remaining=round(b["total_entitlement"] - used, 1)
        ))
    return result

@api_router.put("/vacation/balance/{balance_year}")
async def upsert_vacation_balance(balance_year: int, total_entitlement: float):
    await db.vacation_balances.update_one(
        {"balance_year": balance_year},
        {"$set": {"balance_year": balance_year, "total_entitlement": total_entitlement}},
        upsert=True
    )
    return {"message": f"Balance for {balance_year} set to {total_entitlement} days"}

@api_router.get("/vacation", response_model=List[VacationEntry])
async def get_vacation_entries(year: Optional[int] = None, month: Optional[int] = None):
    query = {}
    if year:  query["year"]  = year
    if month: query["month"] = month
    cursor = db.vacation_entries.find(query).sort("date", 1)
    return [VacationEntry(**e) for e in await cursor.to_list(500)]

@api_router.post("/vacation", response_model=VacationEntry)
async def create_vacation_entry(data: VacationEntryCreate):
    try:
        parsed = datetime.strptime(data.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    entry = VacationEntry(
        date=data.date, year=parsed.year, month=parsed.month,
        days=data.days, balance_year=data.balance_year, notes=data.notes
    )
    await db.vacation_entries.insert_one(entry.model_dump())
    return entry

@api_router.delete("/vacation/{entry_id}")
async def delete_vacation_entry(entry_id: str):
    result = await db.vacation_entries.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Deleted"}

# ============= SICK DAY ROUTES =============

class SickDay(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    year: int
    month: int
    days: float
    notes: str = ""

class SickDayCreate(BaseModel):
    date: str
    days: float
    notes: str = ""

@api_router.get("/sick-days", response_model=List[SickDay])
async def get_sick_days(year: Optional[int] = None, month: Optional[int] = None):
    query = {}
    if year:  query["year"]  = year
    if month: query["month"] = month
    cursor = db.sick_days.find(query).sort("date", 1)
    return [SickDay(**s) for s in await cursor.to_list(500)]

@api_router.post("/sick-days", response_model=SickDay)
async def create_sick_day(data: SickDayCreate):
    try:
        parsed = datetime.strptime(data.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    entry = SickDay(
        date=data.date, year=parsed.year, month=parsed.month,
        days=data.days, notes=data.notes
    )
    await db.sick_days.insert_one(entry.model_dump())
    return entry

@api_router.delete("/sick-days/{entry_id}")
async def delete_sick_day(entry_id: str):
    result = await db.sick_days.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Deleted"}

@api_router.get("/sick-days/summary")
async def get_sick_days_summary(year: int):
    cursor = db.sick_days.find({"year": year}).sort("date", 1)
    entries = await cursor.to_list(500)
    by_month = {}
    for e in entries:
        m = e["month"]
        by_month[m] = round(by_month.get(m, 0) + e["days"], 1)
    return {"year": year, "by_month": by_month, "total": round(sum(by_month.values()), 1)}

# ============= PUBLIC HOLIDAY CALENDAR =============

@api_router.get("/public-holidays/{year}")
async def get_public_holidays(year: int, country: str = "NL"):
    import httpx
    url = f"https://date.nager.at/api/v3/PublicHolidays/{year}/{country.upper()}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Could not fetch holiday data")
        return [{"date": h["date"], "name": h["localName"]} for h in resp.json()]
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Holiday API timed out")

# ============= ANNUAL PDF =============

@api_router.get("/export/{year}/annual-pdf")
async def generate_annual_pdf(year: int):
    """Year-end summary PDF — one table of all 12 months."""
    settings = await get_settings()
    yearly   = await get_yearly_summary(year)
    buffer   = io.BytesIO()
    doc      = SimpleDocTemplate(buffer, pagesize=A4,
                                  topMargin=40, bottomMargin=40,
                                  leftMargin=50, rightMargin=50)
    styles = getSampleStyleSheet()
    BLUE  = colors.HexColor('#2563EB')
    LBLUE = colors.HexColor('#EFF6FF')
    GRAY  = colors.HexColor('#64748B')

    elements = []
    elements.append(Paragraph(settings.company_name,
        ParagraphStyle('T', parent=styles['Normal'], fontSize=20,
                       fontName='Helvetica-Bold', spaceAfter=4,
                       textColor=colors.HexColor('#0F172A'))))
    elements.append(Paragraph(f'Year-End Summary · {year}',
        ParagraphStyle('S', parent=styles['Normal'], fontSize=13,
                       textColor=GRAY, spaceAfter=20)))

    header = ['Month','Worked h','AZK Δ','AZK Bank','Vac','Sick','Gross €','Tax €','Payout €']
    table_data = [header]
    for m in yearly.months:
        if m.has_data:
            sign = '+' if m.azk_change >= 0 else ''
            table_data.append([
                m.month_name[:3],
                f'{m.total_worked_hours:.1f}',
                f'{sign}{m.azk_change:.1f}',
                f'{m.azk_bank_total:.1f}',
                str(m.vacation_days) if m.vacation_days else '—',
                str(m.sick_days)     if m.sick_days     else '—',
                f'{m.gross_pay:.2f}',
                f'{m.tax:.2f}',
                f'{m.final_payout:.2f}',
            ])
        else:
            table_data.append([m.month_name[:3],'—','—','—','—','—','—','—','—'])

    table_data.append([
        'TOTAL',
        f'{yearly.total_worked_hours:.1f}', '—', '—',
        '—', '—',
        f'{yearly.total_gross_pay:.2f}',
        f'{yearly.total_tax:.2f}',
        f'{yearly.total_final_payout:.2f}',
    ])

    col_w = [55, 55, 45, 55, 30, 30, 65, 55, 65]
    t = Table(table_data, colWidths=col_w, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0,0),  (-1,0),  BLUE),
        ('TEXTCOLOR',     (0,0),  (-1,0),  colors.white),
        ('FONTNAME',      (0,0),  (-1,0),  'Helvetica-Bold'),
        ('FONTSIZE',      (0,0),  (-1,-1), 9),
        ('ALIGN',         (1,0),  (-1,-1), 'RIGHT'),
        ('ALIGN',         (0,0),  (0,-1),  'LEFT'),
        ('ROWBACKGROUNDS',(0,1),  (-1,-2), [colors.white, colors.HexColor('#F8FAFC')]),
        ('BACKGROUND',    (0,-1), (-1,-1), LBLUE),
        ('FONTNAME',      (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('TOPPADDING',    (0,0),  (-1,-1), 6),
        ('BOTTOMPADDING', (0,0),  (-1,-1), 6),
        ('GRID',          (0,0),  (-1,-1), 0.4, colors.HexColor('#E2E8F0')),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 16))
    elements.append(Paragraph(
        f'Rate: €{settings.hourly_rate:.4f}/hr · Tax: {settings.tax_rate*100:.2f}% · '
        f'Contract: {settings.contract_hours:.2f} hrs/month',
        ParagraphStyle('Info', parent=styles['Normal'], fontSize=9, textColor=GRAY)
    ))
    elements.append(Paragraph(
        f'Generated {datetime.now().strftime("%Y-%m-%d %H:%M")} · MUL Salary Tracker',
        ParagraphStyle('F', parent=styles['Normal'], fontSize=8,
                       textColor=colors.HexColor('#94A3B8'), alignment=1)
    ))
    doc.build(elements)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf",
                             headers={"Content-Disposition":
                                      f"attachment; filename=annual_{year}.pdf"})

# ============= EMAIL AUTO-SEND =============

@api_router.post("/email/auto-send")
async def auto_send_payslip():
    """Send last month's payslip if today matches auto_email_day."""
    settings = await get_settings()
    today    = datetime.now()
    if today.day != settings.auto_email_day:
        return {"message": f"Not send day (today={today.day}, configured={settings.auto_email_day})", "sent": False}
    if not settings.email_address or not settings.email_password:
        raise HTTPException(status_code=400, detail="Email not configured in settings")
    target_year  = today.year if today.month > 1 else today.year - 1
    target_month = today.month - 1 if today.month > 1 else 12
    summary = await get_monthly_summary(target_year, target_month)
    month_label = datetime(target_year, target_month, 1).strftime('%B %Y')
    msg = MIMEMultipart()
    msg['From']    = settings.email_address
    msg['To']      = settings.email_address
    msg['Subject'] = f"Payslip · {month_label}"
    meal_t = getattr(summary, 'meal_total', 0) or 0
    final  = getattr(summary, 'final_payout', summary.net_pay)
    body = f"""<html><body style="font-family:Arial,sans-serif;max-width:520px">
<h2 style="color:#2563EB">{settings.company_name}</h2>
<p>Payslip for <strong>{month_label}</strong> attached.</p>
<table style="border-collapse:collapse;width:100%;margin:16px 0">
  <tr><td style="padding:8px;border:1px solid #e2e8f0">Worked Hours</td>
      <td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">{summary.total_worked_hours:.2f} hrs</td></tr>
  <tr style="background:#f8fafc"><td style="padding:8px;border:1px solid #e2e8f0">AZK Bank</td>
      <td style="padding:8px;border:1px solid #e2e8f0">{summary.azk_bank_total:.2f} hrs</td></tr>
  <tr><td style="padding:8px;border:1px solid #e2e8f0">Gross Pay</td>
      <td style="padding:8px;border:1px solid #e2e8f0">€{summary.gross_pay:.2f}</td></tr>
  <tr style="background:#eff6ff"><td style="padding:8px;border:1px solid #2563EB;font-weight:bold">Final Payout</td>
      <td style="padding:8px;border:1px solid #2563EB;font-weight:bold;color:#2563EB;font-size:16px">€{final:.2f}</td></tr>
</table>
</body></html>"""
    msg.attach(MIMEText(body, 'html'))
    try:
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.email_address, settings.email_password)
        server.send_message(msg)
        server.quit()
        return {"message": f"Payslip for {month_label} sent to {settings.email_address}", "sent": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

# ============= DATABASE RESET TOOLS =============

@api_router.delete("/entries/all")
async def delete_all_entries():
    """Delete ALL work entries. Use when old corrupted data needs to be wiped."""
    result = await db.work_entries.delete_many({})
    return {"message": f"Deleted {result.deleted_count} entries. Database is now clean."}

@api_router.delete("/entries/before/{year}/{month}")
async def delete_entries_before(year: int, month: int):
    """Delete all entries strictly before the given year/month.
    Useful to wipe only old corrupted months while keeping recent correct data.
    """
    # Build date prefix list for all months before target
    dates_to_delete = []
    for y in range(2020, year + 1):
        for m in range(1, 13):
            if y < year or (y == year and m < month):
                dates_to_delete.append(f"{y}-{m:02d}")

    deleted = 0
    for prefix in dates_to_delete:
        result = await db.work_entries.delete_many(
            {"date": {"$regex": f"^{prefix}"}}
        )
        deleted += result.deleted_count

    return {
        "message": f"Deleted {deleted} entries before {year}-{month:02d}. Recent data preserved."
    }

@api_router.get("/debug/azk-breakdown")
async def debug_azk_breakdown():
    """Show per-month AZK contribution so you can see which months are corrupting the bank."""
    settings = await get_settings()
    pipeline = [
        {"$group": {
            "_id": {
                "year":  {"$year":  {"$dateFromString": {"dateString": "$date"}}},
                "month": {"$month": {"$dateFromString": {"dateString": "$date"}}}
            },
            "worked_hours":    {"$sum": "$working_hours"},
            "entry_count":     {"$sum": 1},
            "absent_holidays": {"$sum": {"$cond": [
                {"$and": [
                    {"$eq": ["$is_public_holiday", True]},
                    {"$eq": ["$working_hours", 0]}
                ]}, 1, 0
            ]}},
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1}}
    ]
    results = await db.work_entries.aggregate(pipeline).to_list(200)
    breakdown = []
    running = settings.manual_azk_adjustment
    for r in results:
        yr, mo = r["_id"]["year"], r["_id"]["month"]
        ph_credit = r["absent_holidays"] * settings.daily_standard_hours
        try:
            vac_cur = db.vacation_entries.find({"year": yr, "month": mo})
            vac_l   = await vac_cur.to_list(100)
        except Exception:
            vac_l = []
        vac_hours = sum(v.get("days", 0) for v in vac_l) * settings.daily_standard_hours
        effective  = r["worked_hours"] + ph_credit + vac_hours
        azk_change = round(effective - settings.contract_hours, 2)
        running    = round(running + azk_change, 2)
        breakdown.append({
            "month":        f"{yr}-{mo:02d}",
            "entries":      r["entry_count"],
            "worked_hours": round(r["worked_hours"], 2),
            "ph_credit":    round(ph_credit, 2),
            "vac_hours":    round(vac_hours, 2),
            "effective":    round(effective, 2),
            "azk_change":   azk_change,
            "bank_after":   running,
        })
    return {
        "manual_adjustment": settings.manual_azk_adjustment,
        "contract_hours":    settings.contract_hours,
        "daily_std_hours":   settings.daily_standard_hours,
        "breakdown":         breakdown,
        "final_bank":        running,
    }

# ============= RECALCULATE ALL ENTRIES =============

@api_router.post("/recalculate-all")
async def recalculate_all_entries():
    """Recalculate working_hours and all pay fields for every stored entry.

    Call this once after changing settings (hourly rate, tax rate) or after
    importing old data to ensure all values are consistent with current rules.
    """
    settings = await get_settings()
    entries  = await db.work_entries.find({}, {"_id": 0}).to_list(10000)
    updated  = 0
    for entry in entries:
        # Always recalculate from raw time fields
        pay_data = calculate_entry_pay(entry, settings)
        await db.work_entries.update_one(
            {"id": entry["id"]},
            {"$set": {
                "working_hours": pay_data["working_hours"],
                "bonus":         pay_data["bonus"],
                "gross_pay":     pay_data["gross_pay"],
                "tax":           pay_data["tax"],
                "net_pay":       pay_data["net_pay"],
                "final_payout":  pay_data["final_payout"],
            }}
        )
        updated += 1
    return {"message": f"Recalculated {updated} entries with current settings"}

# ============= SETTINGS ROUTES =============

@api_router.get("/settings", response_model=Settings)
async def get_app_settings():
    """Get application settings."""
    return await get_settings()

@api_router.put("/settings", response_model=Settings)
async def update_settings(update: SettingsUpdate):
    """Update application settings."""
    settings = await get_settings()
    settings_dict = settings.model_dump()
    
    update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
    settings_dict.update(update_dict)
    
    await db.settings.update_one(
        {"id": "settings"},
        {"$set": settings_dict},
        upsert=True
    )
    
    # Recalculate all entries with new rates if rate changed
    if "hourly_rate" in update_dict or "tax_rate" in update_dict:
        new_settings = Settings(**settings_dict)
        entries = await db.work_entries.find({}, {"_id": 0}).to_list(10000)
        for entry in entries:
            pay_data = calculate_entry_pay(entry, new_settings)
            await db.work_entries.update_one(
                {"id": entry["id"]},
                {"$set": pay_data}
            )
    
    return Settings(**settings_dict)

# ============= UPLOAD ROUTE =============

@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload CSV or Excel file and parse entries."""
    try:
        contents = await file.read()
        
        # Determine file type
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        elif file.filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or Excel.")
        
        # Try to map columns
        column_mapping = {
            'date': ['date', 'Date', 'DATE', 'datum', 'Datum'],
            'start_time': ['start_time', 'Start Time', 'start', 'Start', 'START', 'begin', 'Begin'],
            'end_time': ['end_time', 'End Time', 'end', 'End', 'END', 'einde', 'Einde'],
            'break_hours': ['break_hours', 'Break', 'break', 'Break Hours', 'pauze', 'Pauze'],
            'travel_allowance': ['travel_allowance', 'travel_eur', 'Travel', 'travel', 'reiskosten', 'Reiskosten'],
            'meal_allowance':   ['meal_allowance', 'meal', 'meal_eur', 'verpflegung', 'Verpflegung'],
            'is_public_holiday': ['is_public_holiday', 'public_holiday', 'Holiday', 'holiday', 'feestdag', 'Feestdag'],
            'notes': ['notes', 'Notes', 'NOTES', 'opmerkingen', 'Opmerkingen']
        }
        
        # Find matching columns
        mapped_cols = {}
        for target, options in column_mapping.items():
            for opt in options:
                if opt in df.columns:
                    mapped_cols[target] = opt
                    break
        
        if 'date' not in mapped_cols:
            raise HTTPException(status_code=400, detail="Could not find date column in file")
        
        entries_preview = []
        skipped_rows   = 0
        settings       = await get_settings()

        def safe_float(val, default=0.0):
            try:
                f = float(val)
                return default if (f != f) else f
            except (ValueError, TypeError):
                return default

        for _, row in df.iterrows():
            # Date — supports DD-MM-YYYY and YYYY-MM-DD
            raw_date = str(row.get(mapped_cols.get('date', 'date'), '') or '').strip()
            if not raw_date or raw_date.lower() in ('nan', 'none', ''):
                skipped_rows += 1; continue
            try:
                try:
                    parsed_date = datetime.strptime(raw_date, '%d-%m-%Y')
                except ValueError:
                    parsed_date = pd.to_datetime(raw_date, dayfirst=True).to_pydatetime()
                date_str = parsed_date.strftime('%Y-%m-%d')
            except Exception:
                skipped_rows += 1; continue

            def get_time(col_key):
                val = str(row.get(mapped_cols.get(col_key, col_key), '') or '').strip()
                return val if val and val.lower() not in ('nan', 'none', '00:00') else ''

            start_time = get_time('start_time')
            end_time   = get_time('end_time')
            if not start_time or not end_time:
                skipped_rows += 1; continue

            break_hours  = safe_float(row.get(mapped_cols.get('break_hours',  'break_hours')),  0.0)
            travel       = safe_float(row.get(mapped_cols.get('travel_allowance', 'travel_allowance')), 0.0)
            meal         = safe_float(row.get(mapped_cols.get('meal_allowance',   'meal_allowance')),   0.0)

            raw_ph = row.get(mapped_cols.get('is_public_holiday', 'is_public_holiday'), False)
            if isinstance(raw_ph, str):
                is_ph = raw_ph.strip().upper() in ('Y', 'YES', 'TRUE', '1')
            elif raw_ph != raw_ph:
                is_ph = False
            else:
                is_ph = bool(raw_ph)

            notes = str(row.get(mapped_cols.get('notes', 'notes'), '') or '').strip()
            if notes.lower() in ('nan', 'none'): notes = ''

            entry_data = {
                'date': date_str, 'start_time': start_time, 'end_time': end_time,
                'break_hours': break_hours, 'travel_allowance': travel,
                'meal_allowance': meal, 'is_public_holiday': is_ph, 'notes': notes,
            }
            pay_data = calculate_entry_pay(entry_data, settings)
            entry_data.update(pay_data)
            # Final NaN sanitisation
            for k, v in entry_data.items():
                if isinstance(v, float) and v != v:
                    entry_data[k] = 0.0
            entries_preview.append(entry_data)
        
        return {
            "message": "File parsed successfully",
            "columns_found": list(mapped_cols.keys()),
            "entries_count":   len(entries_preview),
            "skipped_rows":    skipped_rows,
            "entries_preview": entries_preview
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@api_router.post("/upload/save")
async def save_uploaded_entries(entries: List[WorkEntryCreate]):
    """Save uploaded entries to database, avoiding duplicates."""
    settings = await get_settings()
    saved = 0
    skipped = 0
    
    for entry in entries:
        # Check for existing entry on same date
        existing = await db.work_entries.find_one({"date": entry.date})
        
        if existing:
            skipped += 1
            continue
        
        entry_dict = entry.model_dump()
        pay_data = calculate_entry_pay(entry_dict, settings)
        
        work_entry = WorkEntry(
            **entry_dict,
            **pay_data
        )
        
        await db.work_entries.insert_one(work_entry.model_dump())
        saved += 1
    
    return {"message": f"Saved {saved} entries, skipped {skipped} duplicates"}

# ============= PDF GENERATION =============

@api_router.get("/payslip/{year}/{month}/pdf")
async def generate_payslip_pdf(year: int, month: int):
    """Generate PDF payslip for a month."""
    summary = await get_monthly_summary(year, month)
    settings = await get_settings()
    
    # Create PDF buffer
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=20,
        textColor=colors.HexColor('#0F172A')
    )
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#64748B')
    )
    
    elements = []
    
    # Header
    elements.append(Paragraph(settings.company_name, title_style))
    elements.append(Paragraph(f"Payslip - {datetime(year, month, 1).strftime('%B %Y')}", subtitle_style))
    elements.append(Spacer(1, 30))
    
    meal_t = getattr(summary, 'meal_total', 0) or 0
    final  = getattr(summary, 'final_payout', summary.net_pay)
    vac_d  = getattr(summary, 'vacation_days', 0) or 0
    sick_d = getattr(summary, 'sick_days', 0) or 0

    # Summary Table — matches real payslip structure
    summary_data = [
        ['Description', 'Hours / Days', 'Amount (€)'],
        # Hours section
        ['Total Worked Hours',   f'{summary.total_worked_hours:.2f} hrs', ''],
        ['Contract Hours',       f'{settings.contract_hours:.2f} hrs', ''],
        ['AZK Change',           f'{summary.azk_change:+.2f} hrs', ''],
        ['AZK Bank Balance',     f'{summary.azk_bank_total:.2f} hrs', ''],
    ]
    if vac_d:
        summary_data.append(['Vacation Days Used', f'{vac_d:.1f} days', ''])
    if sick_d:
        summary_data.append(['Sick Days', f'{sick_d:.1f} days', ''])
    summary_data += [
        ['', '', ''],
        # Salary section (taxable)
        ['Hourly Rate',          f'€{settings.hourly_rate:.4f}/hr', ''],
        ['Base Pay (taxable)',   f'{summary.payable_hours:.2f} hrs × €{settings.hourly_rate:.4f}',
         f'€{summary.gross_pay:.2f}'],
        [f'Tax ({settings.tax_rate*100:.2f}%)', '', f'-€{summary.tax:.2f}'],
        ['Net Earned',           '', f'€{summary.net_pay:.2f}'],
        ['', '', ''],
        # Post-tax tax-free additions
        ['Bonus (6+ hrs, tax-free)',   '', f'€{summary.bonus_total:.2f}'],
        ['Travel Allowance (tax-free)','', f'€{summary.travel_total:.2f}'],
        ['Meal Allowance (tax-free)',  '', f'€{meal_t:.2f}'],
        ['', '', ''],
        ['FINAL PAYOUT',         '', f'€{final:.2f}'],
    ]
    
    table = Table(summary_data, colWidths=[200, 150, 100])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563EB')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#EFF6FF')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
    ]))
    
    elements.append(table)
    elements.append(Spacer(1, 30))
    
    # Footer
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#94A3B8')
    )
    elements.append(Paragraph(f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}", footer_style))
    elements.append(Paragraph("This is an automatically generated payslip.", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"payslip_{year}_{month:02d}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ============= EXCEL EXPORT =============

@api_router.get("/export/{year}/{month}/excel")
async def export_to_excel(year: int, month: int):
    """Export monthly data to Excel."""
    summary = await get_monthly_summary(year, month)
    
    # Create DataFrame from entries
    entries_data = [e.model_dump() for e in summary.entries]
    df = pd.DataFrame(entries_data)
    
    if not df.empty:
        # Select and rename columns
        df = df[['date', 'start_time', 'end_time', 'break_hours', 'working_hours', 
                 'travel_allowance', 'is_public_holiday', 'bonus', 'gross_pay', 'tax', 'net_pay', 'notes']]
        df.columns = ['Date', 'Start Time', 'End Time', 'Break (hrs)', 'Working Hours',
                      'Travel (€)', 'Public Holiday', 'Bonus (€)', 'Gross (€)', 'Tax (€)', 'Net (€)', 'Notes']
    
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Work Entries', index=False)
        
        # Add summary sheet
        summary_df = pd.DataFrame({
            'Metric': ['Total Hours', 'Payable Hours', 'AZK Change', 'AZK Bank Total',
                       'Gross Pay', 'Tax', 'Bonus Total', 'Travel Total', 'Net Pay'],
            'Value': [summary.total_worked_hours, summary.payable_hours, summary.azk_change,
                      summary.azk_bank_total, summary.gross_pay, summary.tax,
                      summary.bonus_total, summary.travel_total, summary.net_pay]
        })
        summary_df.to_excel(writer, sheet_name='Summary', index=False)
    
    buffer.seek(0)
    filename = f"salary_report_{year}_{month:02d}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ============= EMAIL ROUTES =============

@api_router.post("/email/send")
async def send_email_with_payslip(request: EmailRequest):
    """Send email with PDF payslip attachment."""
    settings = await get_settings()
    
    if not settings.email_address or not settings.email_password:
        raise HTTPException(status_code=400, detail="Email not configured in settings")
    
    summary = await get_monthly_summary(request.year, request.month)
    
    # Generate PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=24)
    
    elements = []
    elements.append(Paragraph(f"{settings.company_name} - Payslip", title_style))
    elements.append(Paragraph(f"{datetime(request.year, request.month, 1).strftime('%B %Y')}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    summary_data = [
        ['Metric', 'Value'],
        ['Total Hours', f'{summary.total_worked_hours:.2f}'],
        ['Payable Hours', f'{summary.payable_hours:.2f}'],
        ['Gross Pay', f'€{summary.gross_pay:.2f}'],
        [f'Tax ({settings.tax_rate*100:.2f}%)', f'€{summary.tax:.2f}'],
        ['Net Pay', f'€{summary.net_pay:.2f}'],
    ]
    
    table = Table(summary_data)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563EB')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(table)
    
    doc.build(elements)
    buffer.seek(0)
    pdf_data = buffer.read()
    
    # Create email
    msg = MIMEMultipart()
    msg['From'] = settings.email_address
    msg['To'] = request.recipient_email
    msg['Subject'] = f"Payslip - {datetime(request.year, request.month, 1).strftime('%B %Y')}"
    
    # Email body
    body = f"""
    <html>
    <body style="font-family: Arial, sans-serif;">
        <h2>{settings.company_name} - Monthly Payslip</h2>
        <p>Please find attached your payslip for {datetime(request.year, request.month, 1).strftime('%B %Y')}.</p>
        <table style="border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Total Hours:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{summary.total_worked_hours:.2f}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Gross Pay:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">€{summary.gross_pay:.2f}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tax:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">€{summary.tax:.2f}</td></tr>
            <tr style="background: #EFF6FF;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Net Pay:</strong></td><td style="padding: 8px; border: 1px solid #ddd;"><strong>€{summary.net_pay:.2f}</strong></td></tr>
        </table>
        <p style="color: #666; font-size: 12px;">This is an automated email from MUL Salary Tracker.</p>
    </body>
    </html>
    """
    
    msg.attach(MIMEText(body, 'html'))
    
    # Attach PDF
    pdf_attachment = MIMEApplication(pdf_data, _subtype='pdf')
    pdf_attachment.add_header('Content-Disposition', 'attachment', 
                              filename=f'payslip_{request.year}_{request.month:02d}.pdf')
    msg.attach(pdf_attachment)
    
    # Send email
    try:
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.email_address, settings.email_password)
        server.send_message(msg)
        server.quit()
        return {"message": "Email sent successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()