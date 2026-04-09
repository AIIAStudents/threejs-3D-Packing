import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path):
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def assert_packing_input_assembly_stays_at_application_entrypoint():
    text = read_text(
        "src/backend/contexts/packing/application/packing_execution_service.py"
    )
    assert (
        "from src.backend.contexts.packing.application.packing_input_query_service import ("
        in text
    ), "PackingExecutionService should import PackingInputQueryService"
    assert (
        "PackingInputQueryService.get_latest_layout()" in text
    ), "PackingExecutionService should read layout via PackingInputQueryService"
    assert (
        "PackingInputQueryService.list_items_for_zone(zone_id)" in text
    ), "PackingExecutionService should read zone items via PackingInputQueryService"
    assert (
        "AllocationReadFacade" not in text
        and "InventoryAccessFacade" not in text
        and "SpaceDesignReadFacade" not in text
    ), "PackingExecutionService should not reach directly into other contexts' read facades"


def assert_sequence_write_stays_at_inventory_owner_entrypoint():
    text = read_text("src/backend/contexts/packing/application/sequence_service.py")
    assert (
        "InventoryAccessFacade.update_item_sequence(sequence)" in text
    ), "SequenceService must delegate sequence writes through InventoryAccessFacade"
    assert (
        "UPDATE inventory_items" not in text
    ), "SequenceService must not update inventory_items directly"


def main():
    assert_packing_input_assembly_stays_at_application_entrypoint()
    assert_sequence_write_stays_at_inventory_owner_entrypoint()
    print("Application entrypoint guard passed.")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"Application entrypoint guard failed: {exc}")
        sys.exit(1)
