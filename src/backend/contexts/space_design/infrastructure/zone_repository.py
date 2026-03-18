class ZoneRepository:
    @staticmethod
    def list_zones(conn):
        return conn.execute("SELECT * FROM zones ORDER BY label").fetchall()

    @staticmethod
    def delete_zone(conn, zone_id):
        cursor = conn.cursor()
        cursor.execute("DELETE FROM zones WHERE id = ?", (zone_id,))
        return cursor.rowcount

    @staticmethod
    def replace_zones(conn, zones_data):
        cursor = conn.cursor()
        cursor.execute("DELETE FROM zones")

        for zone in zones_data:
            cursor.execute(
                """
                INSERT INTO zones (label, length, width, height, x, y, rotation)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    zone.get("label", ""),
                    zone.get("length", 0),
                    zone.get("width", 0),
                    zone.get("height", 0),
                    zone.get("x", 0),
                    zone.get("y", 0),
                    zone.get("rotation", 0),
                ),
            )
