# Deployment

DynaDio Slicer is a React/Vite frontend backed by a stateful FastAPI process.
The API keeps uploaded models and running slice jobs in memory and starts
background worker threads, so deploy it as one long-running web service. A
serverless function is not a suitable host for the combined application.

## Option A: one service (recommended)

This option builds the UI and lets FastAPI serve it. It works on Render,
Railway, Fly.io, a VPS, or any platform that can run a Docker container.

### 1. Test locally

From the repository root:

```powershell
docker build -t dynadio-slicer .
docker run --rm -p 8000:8000 dynadio-slicer
```

Open <http://localhost:8000> and check the health endpoint:

```powershell
curl http://localhost:8000/api/health
```

The response should contain `"ok":true`.

### 2. Deploy on Render

1. Push this repository to GitHub.
2. In Render, choose **New > Web Service** and connect the repository.
3. Select **Docker** as the runtime. Render will use the root `Dockerfile`.
4. Choose a plan with enough memory for NumPy/SciPy and model slicing.
5. Set the health check path to `/api/health`.
6. Add a persistent disk if uploaded models must survive restarts. Mount it at
   `/data`; the image already sets `DYNANADIO_HOME=/data/dynadio`.
7. Deploy and open the generated `https://...onrender.com` URL.

Render supplies `PORT`; the container uses it automatically. Do not set a
second start command unless you need to override the Dockerfile.

### 3. Deploy on Railway

1. Create a new Railway project from the GitHub repository.
2. Railway detects the root `Dockerfile` and builds it.
3. Add a volume mounted at `/data` if persistent uploads are required.
4. Generate a public domain.
5. Add an HTTP health check for `/api/health`.

The same container can be deployed to Fly.io or a self-managed Docker host.
Make sure the platform forwards its supplied `PORT` and sends traffic to
`0.0.0.0`, not `127.0.0.1`.

### 4. Production notes

- Use HTTPS; the browser must not make HTTP API requests from an HTTPS page.
- The default upload limit is 80 MB (`MAX_UPLOAD_BYTES` in
  `api/dynadio_api/app.py`).
- A restart clears in-progress jobs and the in-memory model/job registry.
- Run one application process per service. Multiple workers do not share jobs
  or models and can make a job appear missing.
- This app currently allows all CORS origins. Restrict
  `allow_origins` before exposing it to untrusted users.
- Protect the service with platform authentication or a reverse proxy before
  making it public; the API has no built-in user authentication.

## Option B: Vercel frontend plus a separate API

Use this only when the UI must be hosted on Vercel. The FastAPI API still needs
a long-running host such as Render, Railway, Fly.io, or a VM.

### 1. Deploy the API

Deploy the repository with the Docker instructions above and copy its public
API URL, for example `https://dynadio-api.example.com`.

### 2. Create the Vercel project

1. In Vercel, choose **Add New > Project** and import the repository.
2. Set **Root Directory** to `ui`.
3. Keep the framework preset as **Vite**.
4. Set **Build Command** to `npm run build`.
5. Set **Output Directory** to `dist`.
6. Add the environment variable `VITE_API_URL` with the API URL, without a
   trailing slash:

   ```text
   https://dynadio-api.example.com
   ```

7. Deploy. Every later change to `main` can be deployed automatically by
   Vercel.

The frontend uses same-origin requests when `VITE_API_URL` is empty, which is
the correct setting for Option A. When the UI is on Vercel, the variable makes
requests go to the separate FastAPI service.

### 3. Verify the split deployment

1. Open `https://your-project.vercel.app`.
2. In the browser developer tools, confirm `/api/health` requests go to the
   API hostname.
3. Load a demo STL, upload a small STL, start a slice, and download the
   resulting G-code.
4. If the browser reports a CORS error, configure the API's
   `CORSMiddleware` with the exact Vercel origin instead of `*`, then redeploy
   the API.

## Generic platform checklist

For any non-Vercel host, configure:

```text
Build:  docker build -t dynadio-slicer .
Start:  uvicorn dynadio_api.app:app --host 0.0.0.0 --port $PORT
Health: GET /api/health
Port:   the platform-provided PORT value
```

If the platform does not support Docker, use Python 3.11 or newer, install the
project with `pip install .`, build the UI with `cd ui`, `npm ci`, and
`npm run build`, then start Uvicorn from the repository root. The `ui/dist`
directory must exist before the API starts so FastAPI can serve the frontend.
