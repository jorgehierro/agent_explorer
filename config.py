import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'agent-explorer-dev-key-change-in-prod')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///explorer.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    PORT = int(os.environ.get('PORT', 8083))
    DEFAULT_ADMIN_USER = os.environ.get('DEFAULT_ADMIN_USER', 'admin')
    DEFAULT_ADMIN_PASSWORD = os.environ.get('DEFAULT_ADMIN_PASSWORD', 'admin123')
    # Timeouts para proxy (segundos)
    PROXY_DISCOVER_TIMEOUT = 3
    PROXY_SEND_TIMEOUT = 24000
    PROXY_FETCH_TIMEOUT = 15
