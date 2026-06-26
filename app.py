import os
from flask import Flask, send_from_directory, jsonify
from flask_login import LoginManager
from config import Config
from models import db, User, log_audit
from auth import auth_bp
from api import api_bp

def create_app(config_class=Config):
    app = Flask(__name__, static_folder='static', static_url_path='')
    app.config.from_object(config_class)

    # Inicializar Base de Datos
    os.makedirs('instance', exist_ok=True)
    db.init_app(app)

    # Inicializar Flask-Login
    login_manager = LoginManager()
    login_manager.init_app(app)
    
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))
        
    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({'error': 'Unauthorized'}), 401

    # Registrar Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp)

    # Servir Frontend
    @app.route('/')
    def index():
        return app.send_static_file('index.html')

    # Manejo de rutas SPA (si hubiera) o para que index.html sea el default
    @app.route('/<path:path>')
    def serve_static(path):
        if os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        return app.send_static_file('index.html')

    # Crear admin por defecto si no existe
    with app.app_context():
        db.create_all()
        admin_user = app.config.get('DEFAULT_ADMIN_USER', 'admin')
        admin_pass = app.config.get('DEFAULT_ADMIN_PASSWORD', 'admin123')
        
        if not User.query.filter_by(username=admin_user).first():
            user = User(
                username=admin_user, 
                display_name='Administrador', 
                role='admin',
                permissions='{"tabs": ["creator", "playbooks", "workflows"], "agents": "*"}'
            )
            user.set_password(admin_pass)
            db.session.add(user)
            db.session.commit()
            print(f"[*] Creado usuario admin por defecto: {admin_user} / {admin_pass}")

    return app

if __name__ == '__main__':
    app = create_app()
    port = app.config.get('PORT', 8083)
    print(f"[*] Agent Explorer Backend iniciado en http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
