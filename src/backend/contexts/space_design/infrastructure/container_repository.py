import json


class ContainerRepository:
    @staticmethod
    def insert_legacy_container(conn, parameters):
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO containers (parameters) VALUES (?)",
            (parameters,),
        )
        return cursor.lastrowid

    @staticmethod
    def fetch_latest_container(conn):
        return conn.execute(
            "SELECT * FROM containers ORDER BY updated_at DESC, id DESC LIMIT 1"
        ).fetchone()

    @staticmethod
    def upsert_current_container(conn, container_data):
        shape = container_data.get("shape")
        parameters = json.dumps(container_data)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO containers (id, shape, parameters, updated_at)
            VALUES (1, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                shape = excluded.shape,
                parameters = excluded.parameters,
                updated_at = excluded.updated_at
            """,
            (shape, parameters),
        )

    @staticmethod
    def ensure_default_container_record(conn, default_params):
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM containers WHERE id = 1")
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO containers (id, shape, parameters) VALUES (1, 'default', ?)",
                (json.dumps(default_params),),
            )
