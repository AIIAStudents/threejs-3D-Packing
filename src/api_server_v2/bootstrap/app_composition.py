import os

from flask import Flask, jsonify
from flask_cors import CORS

from src.api_server_v2.assignment_api import assignment_api_blueprint
from src.api_server_v2.container.container_cut_space import cut_space_api_blueprint
from src.api_server_v2.container.container_parameters import container_api_blueprint
from src.api_server_v2.groups_inventory.groups_api import groups_api_blueprint
from src.api_server_v2.groups_inventory.groups_inventory_api import items_api_blueprint
from src.api_server_v2.init_db import init_all_tables


BLUEPRINT_SPECS = (
    (groups_api_blueprint, '/api/v2/groups', 'Group management'),
    (items_api_blueprint, '/api/v2/items', 'Inventory management'),
    (container_api_blueprint, '/api/v2/containers', 'Container parameters'),
    (cut_space_api_blueprint, '/api/v2/cutting', 'Cutting jobs'),
    (assignment_api_blueprint, '/api', 'Assignment / sequence'),
)


def register_api_blueprints(app):
    for blueprint, prefix, _label in BLUEPRINT_SPECS:
        app.register_blueprint(blueprint, url_prefix=prefix)


def register_status_routes(app, include_health_alias=False):
    @app.route('/api/v2/status', methods=['GET'])
    def api_status():
        return jsonify({
            'status': 'ok',
            'message': '3D Packing API is running',
            'version': '2.0',
        }), 200

    if include_health_alias:
        @app.route('/health', methods=['GET'])
        def health():
            return jsonify({
                'status': 'ok',
                'message': '3D Packing API is running',
                'version': '2.0',
            })


def print_blueprint_summary():
    print('\nRegistered API Blueprints:')
    for _blueprint, prefix, label in BLUEPRINT_SPECS:
        print(f'   - {prefix}/*    ({label})')


def create_api_app(
    *,
    init_db_on_startup=True,
    reset_db=False,
    reset_db_file=False,
    allow_destructive_reset=False,
    enable_cors=True,
    include_health_alias=False,
    log_startup=True,
):
    app = Flask(__name__)

    if enable_cors:
        CORS(app)

    if log_startup:
        print('\n' + '=' * 60)
        print('  STARTING 3D PACKING API SERVER')
        print('=' * 60)

    if init_db_on_startup:
        try:
            init_all_tables(
                reset_db=reset_db,
                reset_db_file=reset_db_file,
                allow_destructive_reset=allow_destructive_reset,
            )
        except Exception as exc:
            print(f'Database initialization failed: {exc}')
            print('=' * 60)

    register_api_blueprints(app)
    register_status_routes(app, include_health_alias=include_health_alias)

    if log_startup:
        print_blueprint_summary()
        print('=' * 60 + '\n')

    return app


def run_development_server(app, *, default_port=8888, read_env_port=True):
    port = int(os.environ.get('PORT', default_port)) if read_env_port else default_port
    app.run(host='0.0.0.0', port=port, debug=True)
