import requests
import concurrent.futures
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from models import AuditLog, log_audit

api_bp = Blueprint('api', __name__, url_prefix='/api')

def admin_required(f):
    def wrap(*args, **kwargs):
        if not current_user.is_admin:
            return jsonify({'error': 'Admin required'}), 403
        return f(*args, **kwargs)
    wrap.__name__ = f.__name__
    return login_required(wrap)

# --- Proxy a Agentes ---

@api_bp.route('/proxy/discover', methods=['POST'])
@login_required
def discover_agents():
    data = request.get_json() or {}
    base_url = data.get('base_url', '').rstrip('/')
    port_from = data.get('port_from')
    port_to = data.get('port_to')
    
    if not base_url or not isinstance(port_from, int) or not isinstance(port_to, int) or port_from > port_to:
        return jsonify({'error': 'Invalid parameters'}), 400
        
    ports = [p for p in range(port_from, port_to + 1) if p != 9097]
    timeout = current_app.config.get('PROXY_DISCOVER_TIMEOUT', 3)
    results = []

    def check_port(port):
        url = f"{base_url}:{port}"
        try:
            r = requests.get(f"{url}/.well-known/agent.json", timeout=timeout)
            if r.status_code == 200:
                card = r.json()
                return {'name': card.get('name', f'agente-{port}'), 'url': url, 'port': port, 'ok': True, 'card': card}
        except:
            pass
        return {'name': None, 'url': url, 'port': port, 'ok': False}

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(check_port, p): p for p in ports}
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
            
    agents = [r for r in results if r['ok']]
    log_audit(current_user, 'discover', f'Scanned {len(ports)} ports, found {len(agents)} agents', request.remote_addr)
    
    return jsonify({'agents': agents})

@api_bp.route('/proxy/agent-card', methods=['POST'])
@login_required
def agent_card():
    data = request.get_json() or {}
    url = data.get('url')
    if not url:
        return jsonify({'error': 'Missing url'}), 400
        
    try:
        timeout = current_app.config.get('PROXY_DISCOVER_TIMEOUT', 3)
        r = requests.get(f"{url}/.well-known/agent.json", timeout=timeout)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/proxy/send', methods=['POST'])
@login_required
def send_message():
    data = request.get_json() or {}
    url = data.pop('url', None)
    
    if not url:
        return jsonify({'error': 'Missing url'}), 400
        
    try:
        timeout = current_app.config.get('PROXY_SEND_TIMEOUT', 240)
        r = requests.post(f"{url}/tasks/send", json=data, timeout=timeout)
        r.raise_for_status()
        log_audit(current_user, 'send_message', f'Sent message to {url}', request.remote_addr)
        return jsonify(r.json())
    except requests.exceptions.RequestException as e:
        err_msg = str(e)
        if hasattr(e, 'response') and e.response is not None:
            err_msg = e.response.text
        return jsonify({'error': f'Proxy error: {err_msg}'}), 502

@api_bp.route('/proxy/fetch', methods=['POST'])
@login_required
def generic_fetch():
    data = request.get_json() or {}
    url = data.get('url')
    method = data.get('method', 'GET').upper()
    body = data.get('body')
    headers = data.get('headers', {})
    
    if not url:
        return jsonify({'error': 'Missing url'}), 400
        
    try:
        timeout = current_app.config.get('PROXY_FETCH_TIMEOUT', 15)
        
        req_kwargs = {'timeout': timeout}
        if body is not None:
            if headers.get('Content-Type') == 'text/plain':
                req_kwargs['data'] = body.encode('utf-8') if isinstance(body, str) else body
            else:
                req_kwargs['json'] = body
        if headers:
            req_kwargs['headers'] = headers
            
        r = requests.request(method, url, **req_kwargs)
        
        try:
            resp_data = r.json()
        except:
            resp_data = r.text
            
        if not r.ok:
            return jsonify({'error': str(resp_data)}), r.status_code
            
        return jsonify(resp_data)
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Proxy error: {str(e)}'}), 502

# --- Audit Logs ---

@api_bp.route('/audit/logs', methods=['GET'])
@admin_required
def get_audit_logs():
    limit = request.args.get('limit', 100, type=int)
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return jsonify({'logs': [l.to_dict() for l in logs]})
