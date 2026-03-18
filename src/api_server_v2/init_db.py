"""
Database initialization entry point.
Tables are created only if they do not exist unless reset flags are enabled.
"""

import os

from src.api_server_v2.bootstrap.db_bootstrap import initialize_database_schema


def init_all_tables(
    reset_db=False,
    reset_db_file=False,
    allow_destructive_reset=None,
):
    """
    Initialize the shared database schema for all active contexts.

    Args:
        reset_db: Drop existing runtime tables before recreating them.
        reset_db_file: Remove the SQLite database file before initialization.
        allow_destructive_reset: Explicitly opt into destructive reset behavior.
    """
    print('=' * 50)
    print('Initializing Database Tables...')

    if os.getenv('RESET_DB') == '1':
        reset_db = True
        print('RESET_DB=1 detected - runtime tables will be recreated')

    if os.getenv('RESET_DB_FILE') == '1':
        reset_db_file = True
        print('RESET_DB_FILE=1 detected - database file will be recreated')

    if allow_destructive_reset is None:
        allow_destructive_reset = bool(reset_db or reset_db_file)

    print('=' * 50)

    counts = initialize_database_schema(
        reset_db=reset_db,
        reset_db_file=reset_db_file,
        allow_destructive_reset=allow_destructive_reset,
    )

    print()
    print('Current Data:')
    print(f"   Groups: {counts['groups']}")
    print(f"   Zones: {counts['zones']}")
    print('=' * 50)
    print('Database initialization complete!')
    if reset_db_file:
        print('Database file was recreated')
    elif reset_db:
        print('Runtime tables were reset')
    else:
        print('Existing data was preserved where possible')
    print('=' * 50)
