"""
Main Flask application entry point.
Coordinates API blueprint registration and database initialization through
shared bootstrap helpers.
"""

from src.api_server_v2.bootstrap.app_composition import (
    create_api_app,
    run_development_server,
)


app = create_api_app(
    init_db_on_startup=True,
    include_health_alias=True,
)


if __name__ == '__main__':
    print('Server starting on http://0.0.0.0:8888')
    print('Press CTRL+C to stop')
    print('=' * 60 + '\n')
    run_development_server(app, default_port=8888, read_env_port=False)
