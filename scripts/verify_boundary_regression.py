import json
import sqlite3
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = REPO_ROOT / "src"
DB_PATH = SRC_ROOT / "db_v2" / "session_data.db"

sys.path.insert(0, str(REPO_ROOT))

from src.api_server_v2.bootstrap.app_composition import create_api_app
from src.api_server_v2.bootstrap.db_bootstrap import initialize_database_schema


def read_text(relative_path):
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def assert_source_guards():
    sequence_service = read_text(
        "src/backend/contexts/packing/application/sequence_service.py"
    )
    packing_repository = read_text(
        "src/backend/contexts/packing/infrastructure/packing_repository.py"
    )
    app_router = read_text("src/js_v2/AppRouter.js")
    three_viewer = read_text("src/js_v2/view/three_viewer.js")

    assert "InventoryAccessFacade.update_item_sequence(sequence)" in sequence_service
    assert "UPDATE inventory_items" not in packing_repository
    assert "HTML_MODULES = import.meta.glob" in app_router
    assert "loadRouteHtml(" in app_router
    assert (
        "new Worker(new URL('../workers/geometry_builder.worker.js', import.meta.url))"
        in three_viewer
    )


def build_test_app():
    return create_api_app(
        init_db_on_startup=True,
        include_health_alias=True,
        log_startup=False,
    )


def create_seed_data(client):
    response = client.post("/api/v2/groups/", json={"name": "boundary-regression-g"})
    assert response.status_code in (200, 201), response.get_data(as_text=True)
    group = response.get_json()
    group_id = group.get("id") or group.get("group", {}).get("id")
    assert group_id is not None, group

    response = client.post(
        "/api/v2/items/bulk",
        json={
            "items": [
                {
                    "name": "A",
                    "length": 100,
                    "width": 80,
                    "height": 60,
                    "quantity": 1,
                    "group_id": group_id,
                },
                {
                    "name": "B",
                    "length": 110,
                    "width": 90,
                    "height": 70,
                    "quantity": 1,
                    "group_id": group_id,
                },
                {
                    "name": "C",
                    "length": 120,
                    "width": 100,
                    "height": 80,
                    "quantity": 1,
                    "group_id": group_id,
                },
            ]
        },
    )
    assert response.status_code in (200, 201), response.get_data(as_text=True)

    response = client.post(
        "/api/v2/containers/",
        json={
            "name": "boundary-regression-container",
            "shape": "rect",
            "parameters": {"widthX": 4000, "heightY": 2500, "depthZ": 3000},
        },
    )
    assert response.status_code in (200, 201), response.get_data(as_text=True)

    response = client.post(
        "/api/v2/cutting/jobs",
        json={
            "container": {
                "shape": "rect",
                "parameters": {"widthX": 4000, "heightY": 2500, "depthZ": 3000},
            },
            "zones": [
                {
                    "label": "50187",
                    "length": 2200,
                    "width": 1200,
                    "height": 2500,
                    "x": 1100,
                    "y": 1500,
                    "rotation": 0,
                },
                {
                    "label": "50287",
                    "length": 1800,
                    "width": 1200,
                    "height": 2500,
                    "x": 3000,
                    "y": 1500,
                    "rotation": 0,
                },
            ],
        },
    )
    assert response.status_code in (200, 201), response.get_data(as_text=True)

    response = client.get("/api/assignment-data")
    assert response.status_code == 200, response.get_data(as_text=True)
    assignment_data = response.get_json()
    zone_ids = [zone["id"] for zone in assignment_data.get("zones", [])][-2:]
    assert len(zone_ids) == 2, assignment_data

    response = client.post(
        "/api/assignments",
        json=[
            {"zone_id": zone_ids[0], "group_id": group_id},
            {"zone_id": zone_ids[1], "group_id": group_id},
        ],
    )
    assert response.status_code in (200, 201), response.get_data(as_text=True)

    return {"group_id": group_id, "zone_ids": zone_ids}


def assert_runtime_guards(client, group_id, zone_ids):
    initialize_database_schema(reset_db=False)

    with sqlite3.connect(DB_PATH) as conn:
        item_ids = [
            row[0]
            for row in conn.execute(
                "SELECT id FROM inventory_items WHERE group_id = ? ORDER BY id ASC",
                (group_id,),
            ).fetchall()
        ]

    response = client.post(
        "/api/sequence/save",
        json={
            "sequence": [
                {"item_id": item_ids[0], "order": 0},
                {"item_id": item_ids[1], "order": 1},
                {"item_id": item_ids[2], "order": 2},
            ]
        },
    )
    assert response.status_code in (200, 201), response.get_data(as_text=True)

    response = client.post("/api/sequence/execute", json={})
    assert response.status_code == 200, response.get_data(as_text=True)

    latest_response = client.get("/api/sequence/latest-result")
    assert latest_response.status_code == 200, latest_response.get_data(as_text=True)
    latest_payload = latest_response.get_json()

    space_response = client.get(f"/api/sequence/space-result/{zone_ids[0]}")
    assert space_response.status_code == 200, space_response.get_data(as_text=True)
    space_payload = space_response.get_json()

    with sqlite3.connect(DB_PATH) as conn:
        assignment_survived = conn.execute(
            "SELECT COUNT(*) FROM zone_assignments WHERE zone_id = ? AND group_id = ?",
            (zone_ids[0], group_id),
        ).fetchone()[0]
        item_orders = [
            row[0]
            for row in conn.execute(
                "SELECT item_order FROM inventory_items WHERE group_id = ? ORDER BY item_order ASC",
                (group_id,),
            ).fetchall()
        ]
        packing_rows = conn.execute(
            "SELECT COUNT(*) FROM packing_results WHERE job_id = ?",
            (latest_payload.get("job_id"),),
        ).fetchone()[0]

    assert assignment_survived >= 1
    assert item_orders == [0, 1, 2]
    assert packing_rows >= 1
    assert len(latest_payload.get("spaces", [])) >= 1

    return {
        "job_id": latest_payload.get("job_id"),
        "assignment_survived_reinit": assignment_survived,
        "item_orders": item_orders,
        "packing_rows": packing_rows,
        "latest_spaces": len(latest_payload.get("spaces", [])),
        "space_result_zone": space_payload.get("space", {}).get("id")
        if isinstance(space_payload, dict)
        else None,
    }


def main():
    assert_source_guards()
    app = build_test_app()
    client = app.test_client()
    seed = create_seed_data(client)
    runtime = assert_runtime_guards(client, seed["group_id"], seed["zone_ids"])

    print(
        json.dumps(
            {
                "status": "ok",
                "group_id": seed["group_id"],
                "zone_ids": seed["zone_ids"],
                **runtime,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
