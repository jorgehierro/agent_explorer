from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    display_name = db.Column(db.String(120), nullable=False, default='')
    role = db.Column(db.String(20), nullable=False, default='user')  # 'admin' o 'user'
    permissions = db.Column(db.String, nullable=False, default='{"tabs": [], "agents": "*"}')
    is_active_flag = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_active(self):
        return self.is_active_flag

    @property
    def is_admin(self):
        return self.role == 'admin'

    def to_dict(self):
        import json
        try:
            perms = json.loads(self.permissions)
        except:
            perms = {"tabs": [], "agents": "*"}
            
        return {
            'id': self.id,
            'username': self.username,
            'display_name': self.display_name,
            'role': self.role,
            'permissions': perms,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class AuditLog(db.Model):
    __tablename__ = 'audit_log'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    username = db.Column(db.String(80), nullable=False, default='system')
    action = db.Column(db.String(100), nullable=False)
    detail = db.Column(db.Text, nullable=True)
    ip = db.Column(db.String(45), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.username,
            'action': self.action,
            'detail': self.detail,
            'ip': self.ip,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


def log_audit(user, action, detail=None, ip=None):
    """Registra una entrada en el audit log."""
    entry = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else 'system',
        action=action,
        detail=detail,
        ip=ip
    )
    db.session.add(entry)
    db.session.commit()
