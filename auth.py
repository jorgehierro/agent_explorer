from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from models import db, User, log_audit

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

def admin_required(f):
    def wrap(*args, **kwargs):
        if not current_user.is_admin:
            return jsonify({'error': 'Admin required'}), 403
        return f(*args, **kwargs)
    wrap.__name__ = f.__name__
    return login_required(wrap)

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Missing credentials'}), 400
        
    user = User.query.filter_by(username=username).first()
    
    if user and user.check_password(password):
        if not user.is_active:
            log_audit(user, 'login_failed', 'Inactive account', request.remote_addr)
            return jsonify({'error': 'Account disabled'}), 403
            
        login_user(user)
        log_audit(user, 'login', 'Success', request.remote_addr)
        return jsonify({'ok': True, 'user': user.to_dict()})
        
    log_audit(None, 'login_failed', f'Invalid credentials for {username}', request.remote_addr)
    return jsonify({'error': 'Invalid username or password'}), 401

@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    log_audit(current_user, 'logout', 'Success', request.remote_addr)
    logout_user()
    return jsonify({'ok': True})

@auth_bp.route('/me', methods=['GET'])
def me():
    if current_user.is_authenticated:
        return jsonify({'user': current_user.to_dict()})
    return jsonify({'error': 'Not authenticated'}), 401

@auth_bp.route('/password', methods=['PUT'])
@login_required
def change_password():
    data = request.get_json() or {}
    old_pw = data.get('old_password')
    new_pw = data.get('new_password')
    
    if not old_pw or not new_pw:
        return jsonify({'error': 'Missing passwords'}), 400
        
    if not current_user.check_password(old_pw):
        return jsonify({'error': 'Invalid old password'}), 400
        
    current_user.set_password(new_pw)
    db.session.commit()
    log_audit(current_user, 'password_changed', 'User changed their password', request.remote_addr)
    return jsonify({'ok': True})

# --- CRUD de usuarios (Solo Admin) ---

@auth_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    users = User.query.all()
    return jsonify({'users': [u.to_dict() for u in users]})

@auth_bp.route('/users', methods=['POST'])
@admin_required
def create_user():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Missing required fields'}), 400
    role = data.get('role', 'user')
    is_active = data.get('is_active', True)
    permissions = data.get('permissions', '{"tabs": [], "agents": "*"}')

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400
        
    new_user = User(
        username=username,
        display_name=data.get('display_name', username),
        role=role,
        permissions=permissions,
        is_active_flag=is_active
    )
    new_user.set_password(password)
    
    db.session.add(new_user)
    db.session.commit()
    log_audit(current_user, 'create_user', f'Created user {username}', request.remote_addr)
    return jsonify({'ok': True, 'user': new_user.to_dict()})

@auth_bp.route('/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}
    
    if 'display_name' in data:
        user.display_name = data['display_name']
    if 'role' in data:
        user.role = data['role']
    if 'permissions' in data:
        user.permissions = data['permissions']
    if 'is_active' in data:
        user.is_active_flag = data['is_active']
    if 'password' in data and data['password']:
        user.set_password(data['password'])
        
    db.session.commit()
    log_audit(current_user, 'update_user', f'Updated user {user.username}', request.remote_addr)
    return jsonify({'ok': True, 'user': user.to_dict()})

@auth_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == current_user.id:
        return jsonify({'error': 'Cannot delete yourself'}), 400
        
    user.is_active_flag = False
    db.session.commit()
    log_audit(current_user, 'deactivate_user', f'Deactivated user {user.username}', request.remote_addr)
    return jsonify({'ok': True})
