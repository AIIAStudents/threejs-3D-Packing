class CuttingSchemaMigration:
    @staticmethod
    def _table_exists(cursor, table_name):
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,),
        )
        return cursor.fetchone() is not None

    @staticmethod
    def _column_names(cursor, table_name):
        cursor.execute(f"PRAGMA table_info({table_name})")
        rows = cursor.fetchall()
        columns = []
        for row in rows:
            if hasattr(row, "keys"):
                columns.append(row["name"])
            else:
                columns.append(row[1])
        return columns

    @classmethod
    def _ensure_cutting_jobs_table(cls, cursor):
        table_exists = cls._table_exists(cursor, "cutting_jobs")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS cutting_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                container_shape TEXT NOT NULL,
                container_parameters TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        if not table_exists:
            print("Created 'cutting_jobs' table.")
            return

        columns = cls._column_names(cursor, "cutting_jobs")
        if "created_at" not in columns:
            print("Migrating 'cutting_jobs' table: adding 'created_at' column.")
            cursor.execute(
                "ALTER TABLE cutting_jobs ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"
            )
        else:
            print("'cutting_jobs' table already exists. Preserving data.")

    @classmethod
    def _ensure_zones_table(cls, cursor):
        table_exists = cls._table_exists(cursor, "zones")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS zones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                length REAL NOT NULL,
                width REAL NOT NULL,
                height REAL NOT NULL,
                x REAL DEFAULT 0,
                y REAL DEFAULT 0,
                rotation REAL DEFAULT 0,
                FOREIGN KEY (job_id) REFERENCES cutting_jobs (id)
            )
            """
        )

        if not table_exists:
            print("Created 'zones' table.")
            return

        columns = cls._column_names(cursor, "zones")
        optional_columns = {
            "x": "ALTER TABLE zones ADD COLUMN x REAL DEFAULT 0",
            "y": "ALTER TABLE zones ADD COLUMN y REAL DEFAULT 0",
            "rotation": "ALTER TABLE zones ADD COLUMN rotation REAL DEFAULT 0",
        }
        migrated_columns = []

        for column_name, statement in optional_columns.items():
            if column_name not in columns:
                cursor.execute(statement)
                migrated_columns.append(column_name)

        if migrated_columns:
            print(
                "Migrated 'zones' table: added columns "
                + ", ".join(f"'{column_name}'" for column_name in migrated_columns)
                + "."
            )
        else:
            print("'zones' table already exists. Preserving data.")

    @staticmethod
    def initialize_cutting_tables(conn):
        cursor = conn.cursor()
        CuttingSchemaMigration._ensure_cutting_jobs_table(cursor)
        CuttingSchemaMigration._ensure_zones_table(cursor)
