# תהילים

Local Hebrew Tehilim reader. Audio is generated with gTTS (Google), so a Python server is required.

## Run on your computer

```powershell
python -m pip install -r requirements.txt
python server.py
```

Open http://localhost:8080

Do not open `index.html` by double-click. The Hebrew voice comes from `/api/speech`.

## Host on the internet (Render)

1. Push this folder to GitHub (see below).
2. On [render.com](https://render.com) create a **Web Service** from the repo.
3. Use:
   - Build: `pip install -r requirements.txt`
   - Start: `gunicorn server:app --bind 0.0.0.0:$PORT --timeout 120 --workers 1`
4. Share the `https://....onrender.com` URL. A phone only needs a browser.

Free Render apps sleep when idle; the first open after sleep can take about a minute.

gTTS talks to Google from the server. Cloud IPs are sometimes blocked; if speech fails only after deploy, a paid Google Cloud TTS key is the next step.
