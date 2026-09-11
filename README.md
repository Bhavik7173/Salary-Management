# MUL Salary Tracker

A full-stack salary and work-hours management application for recording daily shifts, calculating pay and allowances, tracking leave, importing spreadsheets, and generating professional payslips.

> Security note: Never commit database URLs, passwords, API keys, or SMTP credentials. Copy the provided environment example files and configure secrets through your deployment platform.

## Features

- Daily work entries with start time, end time, breaks, notes, and holiday status
- Gross pay, tax, bonus, travel allowance, meal allowance, and net-pay calculations
- Monthly dashboards and yearly summaries
- Vacation and sick-day tracking
- CSV and Excel import
- PDF payslip and annual-report generation
- Excel export and optional SMTP email delivery
- Responsive light and dark user interface

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Tailwind CSS, Shadcn UI, Recharts |
| Backend | FastAPI, Pydantic, Motor |
| Database | MongoDB |
| Documents | ReportLab, Pandas, OpenPyXL |
| Deployment | Vercel, Render, MongoDB Atlas |

## Local development

### Requirements

- Python 3.11
- Node.js 20 or later
- MongoDB

### Backend

```bash
cp backend/.env.example backend/.env
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

On Windows, activate the environment with `.venv\Scripts\activate`.

### Frontend

```bash
cd frontend
npm install
printf "REACT_APP_BACKEND_URL=http://localhost:8000\n" > .env
npm start
```

Open http://localhost:3000. The API documentation is available at http://localhost:8000/docs.

## Configuration

Create `backend/.env` from `backend/.env.example`. Required production values include:

- `MONGO_URL`
- `DB_NAME`
- `CORS_ORIGINS`
- `ADMIN_API_KEY`

The administrative key protects settings changes, database-reset operations, recalculation, and email actions. Supply it as the `X-Admin-Key` request header. Do not put this server-side secret in frontend source code.

See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment instructions and [SECURITY.md](SECURITY.md) for security reporting and production requirements.

## Data privacy

The repository contains only fictional sample work records. Never commit real employee schedules, salary records, email credentials, or personally identifying information.

## Testing

```bash
python -m compileall backend
cd frontend && npm ci && npm run build
```

The backend integration script uses `BACKEND_URL` and `ADMIN_API_KEY` environment variables when exercising a running deployment.

## Project status

This repository is undergoing security hardening. Before deploying publicly, add user authentication and record-level authorization so each user can access only their own data.

## License

No license has been selected. All rights remain reserved until the repository owner adds a license.
