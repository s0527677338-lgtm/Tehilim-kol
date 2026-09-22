# תהילים

Hebrew Tehilim reader. Audio is generated on the server, so it must run as a website (Python server), not as a copied HTML folder.

## Give this to a friend (phone)

A phone cannot run `python server.py`. Your friend gets a **link**, then adds it to her Home Screen. That is the installable app.

1. Deploy this GitHub repo to [Render](https://render.com):
   - New → Web Service → `s0527677338-lgtm/Tehilim-kol`
   - Build: `pip install -r requirements.txt`
   - Start: `gunicorn server:app --bind 0.0.0.0:$PORT --timeout 120 --workers 1`
2. Copy the HTTPS URL, for example `https://tehilim-kol.onrender.com`
3. Send her that URL (WhatsApp).
4. She opens it in **Chrome** (Android) or **Safari** (iPhone):
   - Android Chrome: tap **הוסף למסך הבית** in the page, or Chrome menu → Add to Home screen
   - iPhone Safari: Share → **Add to Home Screen**
5. An icon named תהילים appears. She opens it like any other app.

She needs internet for the Hebrew voice. The first open after Render sleep can take about a minute.

This is not an App Store / Play Store APK. iPhone cannot install a sideloaded Android file. The Home Screen app is the way both phones work.

## Run on your computer

```powershell
python -m pip install -r requirements.txt
python server.py
```

Open http://localhost:8080

## Reading voice

The reader uses the male Hebrew voice `he-IL-AvriNeural` (Microsoft Edge TTS). Set the
`HEBREW_VOICE` environment variable to change it, for example `he-IL-HilaNeural` for the
female voice. If that service cannot be reached, the server falls back to gTTS, which
offers only a female Hebrew voice.
