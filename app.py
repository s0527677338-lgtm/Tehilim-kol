# Render's default gunicorn target is the module named "app". The Flask
# application itself lives in server.py; this file only publishes it under
# the name Render looks for when the start command is `gunicorn app`.
from server import app
