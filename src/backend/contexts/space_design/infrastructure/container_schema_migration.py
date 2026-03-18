class ContainerSchemaMigration:
    @staticmethod
    def initialize_containers_schema(conn):
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS containers (
                id INTEGER PRIMARY KEY,
                shape TEXT NOT NULL DEFAULT 'rect',
                parameters TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        cursor.execute("PRAGMA table_info(containers)")
        columns = [row["name"] for row in cursor.fetchall()]
        if "shape" not in columns:
            print("Migrating 'containers' table: Adding 'shape' column.")
            cursor.execute(
                "ALTER TABLE containers ADD COLUMN shape TEXT NOT NULL DEFAULT 'rect'"
            )
