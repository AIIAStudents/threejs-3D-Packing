class GroupRepository:
    @staticmethod
    def list_groups(conn):
        return [dict(row) for row in conn.execute("SELECT * FROM groups ORDER BY id").fetchall()]

    @staticmethod
    def insert_group(conn, name, description):
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO groups (name, description) VALUES (?, ?)",
            (name, description),
        )
        return cursor.lastrowid

    @staticmethod
    def update_group(conn, group_id, name, description):
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE groups SET name = ?, description = ? WHERE id = ?",
            (name, description, group_id),
        )
        return cursor.rowcount

    @staticmethod
    def delete_group(conn, group_id):
        cursor = conn.cursor()
        cursor.execute("DELETE FROM groups WHERE id = ?", (group_id,))
        return cursor.rowcount
