import os

from src.api_server_v2.assignment_api import init_assignments_table
from src.api_server_v2.container.container_cut_space import init_cutting_tables
from src.api_server_v2.container.container_parameters import init_containers_table
from src.api_server_v2.db_config import SHARED_DATABASE_PATH, get_db_connection
from src.api_server_v2.groups_inventory.groups_api import init_groups_table
from src.api_server_v2.groups_inventory.groups_inventory_api import init_items_table


SCHEMA_INITIALIZERS = (
    ('groups', init_groups_table),
    ('items', init_items_table),
    ('containers', init_containers_table),
    ('cutting', init_cutting_tables),
    ('assignments', init_assignments_table),
)


def resolve_reset_scope(
    *,
    reset_db=False,
    reset_db_file=False,
    allow_destructive_reset=False,
):
    if not (reset_db or reset_db_file):
        return False, False

    if allow_destructive_reset:
        return reset_db, reset_db_file

    print(
        'Destructive reset was requested without an explicit dev/reset guard; '
        'preserving existing data instead.'
    )
    return False, False


def reset_database_file_if_requested(reset_db_file=False):
    if reset_db_file and os.path.exists(SHARED_DATABASE_PATH):
        os.remove(SHARED_DATABASE_PATH)
        print(f"Removed old database file: {SHARED_DATABASE_PATH}")


def drop_runtime_tables(conn):
    cursor = conn.cursor()

    for command in ('DROP VIEW IF EXISTS items', 'DROP TABLE IF EXISTS items'):
        try:
            cursor.execute(command)
        except Exception:
            pass

    cursor.execute('DROP TABLE IF EXISTS inventory_items')
    cursor.execute('DROP TABLE IF EXISTS catalog_items')
    cursor.execute('DROP TABLE IF EXISTS groups')
    cursor.execute('DROP TABLE IF EXISTS packing_results')
    cursor.execute('DROP TABLE IF EXISTS zone_assignments')
    cursor.execute('DROP TABLE IF EXISTS zones')
    cursor.execute('DROP TABLE IF EXISTS cutting_jobs')
    cursor.execute('DROP TABLE IF EXISTS containers')


def initialize_packing_results_table(conn):
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS packing_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            job_id TEXT NOT NULL,
            zone_id INTEGER,
            zone_label TEXT,
            result_json TEXT NOT NULL,
            success BOOLEAN NOT NULL,
            message TEXT,
            packed_count INTEGER,
            unpacked_count INTEGER,
            volume_utilization REAL,
            execution_time_ms REAL
        )
        """
    )


def collect_runtime_counts(conn):
    cursor = conn.cursor()
    return {
        'groups': cursor.execute('SELECT COUNT(*) FROM groups').fetchone()[0],
        'zones': cursor.execute('SELECT COUNT(*) FROM zones').fetchone()[0],
    }


def initialize_database_schema(
    reset_db=False,
    reset_db_file=False,
    allow_destructive_reset=False,
):
    reset_db, reset_db_file = resolve_reset_scope(
        reset_db=reset_db,
        reset_db_file=reset_db_file,
        allow_destructive_reset=allow_destructive_reset,
    )

    reset_database_file_if_requested(reset_db_file=reset_db_file)

    if reset_db and not reset_db_file:
        with get_db_connection() as conn:
            print('Resetting shared database tables...')
            drop_runtime_tables(conn)
            conn.commit()

    for name, initializer in SCHEMA_INITIALIZERS:
        print(f"Initializing schema: {name}")
        initializer()

    with get_db_connection() as conn:
        initialize_packing_results_table(conn)
        counts = collect_runtime_counts(conn)
        conn.commit()

    return counts
