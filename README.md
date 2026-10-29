# 3nricher GUI

Web dashboard for the [3nricher](https://github.com/nullbyte-sec/3nricher-nullbyte-sec) IOC enrichment pipeline.

React + Vite + Tailwind CSS, wired to a Flask SSE backend that runs `make build query IOC=<target>` and streams live enrichment logs.

## Prerequisites

- Node.js 18+
- The 3nricher backend repo cloned and configured (see its README)
- Flask backend running on `http://127.0.0.1:5001`

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173, enter an IP, domain, or hash, and click **Run Enrichment**.

## Backend

The GUI expects the Flask server from the main 3nricher repo:

```bash
cd ../3nricher-nullbyte-sec
source venv/bin/activate
python3 server.py
```

## One-command launcher

If you use the `3nricher` launcher script, it starts both the backend and this GUI and opens the browser automatically.
