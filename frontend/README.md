# MUL Salary Tracker Frontend

React interface for the MUL Salary Tracker.

## Run locally

```bash
npm install
printf "REACT_APP_BACKEND_URL=http://localhost:8000\n" > .env
npm start
```

The development server runs at http://localhost:3000.

## Production build

```bash
npm ci
npm run build
```

Set `REACT_APP_BACKEND_URL` to the public backend origin in the deployment environment. Do not commit environment files or place private credentials in React variables because frontend values are visible in the browser bundle.

Project-level setup, features, security requirements, and deployment information are documented in the [root README](../README.md) and [deployment guide](../DEPLOYMENT.md).
