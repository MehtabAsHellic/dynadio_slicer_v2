# DynaDio Slicer

DynaDio Slicer turns STL models into G-code for an air-pump gel printer. The
core slicer is Python, the API is FastAPI, and the interface is React/Vite.

## Local development

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
cd ui
npm ci
npm run build
cd ..
dynadio-api --host 127.0.0.1 --port 8765
```

Open <http://127.0.0.1:8765>.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Docker, Render, Railway,
Fly.io, and Vercel deployment instructions.
