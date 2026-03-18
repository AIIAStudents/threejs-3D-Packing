from src.backend.shared.db.sqlite import db_session


class GroupSchemaMigration:
    @staticmethod
    def initialize_groups_schema():
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='groups'"
            )
            if cursor.fetchone() is None:
                print("Creating 'groups' table...")
                cursor.execute(
                    """
                    CREATE TABLE groups (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        description TEXT
                    )
                    """
                )
                cursor.execute(
                    "INSERT INTO groups (name, description) VALUES (?, ?)",
                    ("群組 A", "預設建立的示範群組"),
                )
                cursor.execute(
                    "INSERT INTO groups (name, description) VALUES (?, ?)",
                    ("群組 B", ""),
                )
                conn.commit()
                print("Table 'groups' created and initial data inserted.")
            else:
                print("Table 'groups' already exists.")
