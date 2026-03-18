class AllocationRepository:
    @staticmethod
    def initialize_assignments_table(conn):
        cursor = conn.cursor()
        cursor.execute("DROP TABLE IF EXISTS zone_assignments")
        cursor.execute(
            """
            CREATE TABLE zone_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                zone_id INTEGER NOT NULL,
                group_id INTEGER NOT NULL,
                FOREIGN KEY (zone_id) REFERENCES zones (id),
                FOREIGN KEY (group_id) REFERENCES groups (id),
                UNIQUE(zone_id, group_id)
            )
            """
        )

    @staticmethod
    def fetch_container(conn):
        return conn.execute("SELECT * FROM containers WHERE id = 1").fetchone()

    @staticmethod
    def fetch_latest_cutting_job(conn):
        return conn.execute("SELECT * FROM cutting_jobs ORDER BY id DESC LIMIT 1").fetchone()

    @staticmethod
    def fetch_assignment_zones_for_job(conn, job_id):
        return conn.execute(
            """
            SELECT z.*, GROUP_CONCAT(za.group_id) as assigned_group_ids
            FROM zones z
            LEFT JOIN zone_assignments za ON z.id = za.zone_id
            WHERE z.job_id = ?
            GROUP BY z.id
            ORDER BY CAST(z.label AS INTEGER) ASC
            """,
            (job_id,),
        ).fetchall()

    @staticmethod
    def fetch_assigned_spaces_for_job(conn, job_id):
        return conn.execute(
            """
            SELECT DISTINCT z.*
            FROM zones z
            INNER JOIN zone_assignments za ON z.id = za.zone_id
            WHERE z.job_id = ?
            ORDER BY CAST(z.label AS INTEGER) ASC
            """,
            (job_id,),
        ).fetchall()

    @staticmethod
    def replace_assignments(conn, assignments):
        cursor = conn.cursor()
        cursor.execute("BEGIN TRANSACTION;")
        cursor.execute("DELETE FROM zone_assignments;")

        for assignment in assignments:
            cursor.execute(
                "INSERT INTO zone_assignments (zone_id, group_id) VALUES (?, ?)",
                (assignment["zone_id"], assignment["group_id"]),
            )

    @staticmethod
    def replace_legacy_assignment_map(conn, assignments):
        cursor = conn.cursor()
        cursor.execute("DELETE FROM zone_assignments")

        for zone_id, group_ids in assignments.items():
            for group_id in group_ids:
                cursor.execute(
                    "INSERT INTO zone_assignments (zone_id, group_id) VALUES (?, ?)",
                    (int(zone_id), int(group_id)),
                )

    @staticmethod
    def fetch_all_assignments(conn):
        return conn.execute("SELECT * FROM zone_assignments").fetchall()
