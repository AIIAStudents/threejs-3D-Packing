"""
Compatibility wrapper for the historical reset-on-startup API launcher.

Prefer `src/api_server_v2/dev_reset_launcher.py` when you intentionally want a
development-only launcher that recreates the SQLite database on startup.
"""

import os
import sys


current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)


from src.api_server_v2.dev_reset_launcher import app, run_development_server  # noqa: E402


if __name__ == '__main__':
    print('api.py is a compatibility entry. Prefer dev_reset_launcher.py for explicit reset flows.')
    run_development_server(app, default_port=8888, read_env_port=True)
