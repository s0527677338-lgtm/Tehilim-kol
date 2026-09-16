import mimetypes
import hashlib
import io
import os
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory
from gtts import gTTS

mimetypes.add_type("application/manifest+json", ".webmanifest")

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "audio_cache"
MAX_SPEECH_CHARS = 400

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")


@app.route("/", methods=["GET"])
def index():
    return send_from_directory(BASE_DIR, "index.html")


def synthesize_hebrew(text):
    """Render Hebrew text to an mp3, caching by content so each verse is
    fetched from Google once and replayed from disk afterwards."""
    CACHE_DIR.mkdir(exist_ok=True)
    cached = CACHE_DIR / f"{hashlib.sha256(text.encode('utf-8')).hexdigest()}.mp3"
    if cached.exists() and cached.stat().st_size > 0:
        return cached

    buffer = io.BytesIO()
    gTTS(text=text, lang="iw").write_to_fp(buffer)
    cached.write_bytes(buffer.getvalue())
    return cached


@app.route("/api/speech", methods=["POST"])
def speech():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    if not text:
        return jsonify({"error": "missing text"}), 400
    if len(text) > MAX_SPEECH_CHARS:
        return jsonify({"error": "text too long"}), 400

    try:
        audio_path = synthesize_hebrew(text)
    except Exception as error:
        return jsonify({"error": str(error)}), 500

    return send_file(audio_path, mimetype="audio/mpeg", download_name="verse.mp3")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
