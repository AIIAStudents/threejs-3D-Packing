"""
Development-only API launcher that recreates the database file on startup.

Use this entry point when you explicitly want the historical reset-on-startup
behavior for local development or reset workflows.
"""

from src.api_server_v2.bootstrap.app_composition import (
    create_api_app,
    run_development_server,
)


app = create_api_app(
    init_db_on_startup=True,
    reset_db_file=True,
    allow_destructive_reset=True,
    include_health_alias=False,
)


if __name__ == '__main__':
    print('Starting dev reset launcher on http://0.0.0.0:8888')
    print('This entry intentionally recreates the database file on startup.')
    print('=' * 60 + '\n')
    run_development_server(app, default_port=8888, read_env_port=True)
