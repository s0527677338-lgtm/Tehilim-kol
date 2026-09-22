import asyncio
import hashlib
import io
import mimetypes
import os
from pathlib import Path

# Verify TLS against the operating system trust store. Without this the
# synthesis services are unreachable behind proxies that re-sign traffic
# (corporate gateways, filtered ISPs), because their root CA is installed in
# Windows/macOS/Linux but not in certifi's bundle.
try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

import edge_tts
from flask import Flask, jsonify, request, send_file, send_from_directory
from gtts import gTTS

mimetypes.add_type("application/manifest+json", ".webmanifest")

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "audio_cache"
MAX_SPEECH_CHARS = 400

# Avri is the only male Hebrew voice in the service. The multilingual male
# voices are trained on other languages but can read Hebrew too, which gives
# more male options to choose from.
VOICES = {
    "avri": "he-IL-AvriNeural",
    "andrew": "en-US-AndrewMultilingualNeural",
    "brian": "en-US-BrianMultilingualNeural",
    "william": "en-AU-WilliamMultilingualNeural",
    "remy": "fr-FR-RemyMultilingualNeural",
    "florian": "de-DE-FlorianMultilingualNeural",
    "giuseppe": "it-IT-GiuseppeMultilingualNeural",
    "hila": "he-IL-HilaNeural",
}
DEFAULT_VOICE = os.environ.get("HEBREW_VOICE", "avri")
DEFAULT_PITCH = os.environ.get("HEBREW_PITCH", "+0Hz")

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")


@app.route("/", methods=["GET"])
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/api/voices", methods=["GET"])
def voices():
    return jsonify({"voices": sorted(VOICES), "default": DEFAULT_VOICE})


def resolve_voice(name):
    key = (name or DEFAULT_VOICE).strip()
    if key in VOICES:
        return VOICES[key]
    # An explicit full voice name is accepted as long as it is one we offer.
    if key in VOICES.values():
        return key
    return VOICES[DEFAULT_VOICE]


def normalize_pitch(value):
    pitch = (value or DEFAULT_PITCH).strip()
    if not pitch:
        return "+0Hz"
    if not pitch.startswith(("+", "-")):
        pitch = f"+{pitch}"
    if not pitch.endswith("Hz"):
        pitch = f"{pitch}Hz"
    try:
        int(pitch[1:-2])
    except ValueError:
        return "+0Hz"
    return pitch


async def render_with_edge(text, voice, pitch):
    audio = io.BytesIO()
    async for chunk in edge_tts.Communicate(text, voice, pitch=pitch).stream():
        if chunk["type"] == "audio":
            audio.write(chunk["data"])
    data = audio.getvalue()
    if not data:
        raise RuntimeError("empty audio from edge-tts")
    return data


def render_with_gtts(text):
    buffer = io.BytesIO()
    gTTS(text=text, lang="iw").write_to_fp(buffer)
    return buffer.getvalue()


def synthesize_hebrew(text, voice, pitch):
    """Render Hebrew text to an mp3, caching by content, voice and pitch so each
    verse is fetched once and replayed from disk afterwards."""
    CACHE_DIR.mkdir(exist_ok=True)
    key = hashlib.sha256(f"{voice}|{pitch}|{text}".encode("utf-8")).hexdigest()
    cached = CACHE_DIR / f"{key}.mp3"
    if cached.exists() and cached.stat().st_size > 0:
        return cached

    try:
        data = asyncio.run(render_with_edge(text, voice, pitch))
    except Exception:
        # gTTS has only a female Hebrew voice, but it keeps the reading going
        # when the chosen voice cannot be reached.
        data = render_with_gtts(text)

    cached.write_bytes(data)
    return cached


@app.route("/api/speech", methods=["POST"])
def speech():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    if not text:
        return jsonify({"error": "missing text"}), 400
    if len(text) > MAX_SPEECH_CHARS:
        return jsonify({"error": "text too long"}), 400

    voice = resolve_voice(payload.get("voice"))
    pitch = normalize_pitch(payload.get("pitch"))

    try:
        audio_path = synthesize_hebrew(text, voice, pitch)
    except Exception as error:
        return jsonify({"error": str(error)}), 500

    return send_file(audio_path, mimetype="audio/mpeg", download_name="verse.mp3")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
