from src.backend.contexts.allocation.application.allocation_read_facade import (
    AllocationReadFacade,
)
from src.backend.contexts.inventory.application.inventory_access_facade import (
    InventoryAccessFacade,
)
from src.backend.contexts.space_design.application.space_design_read_facade import (
    SpaceDesignReadFacade,
)


class PackingInputQueryService:
    """
    Read-side helper for assembling packing inputs from other contexts.

    This keeps cross-context reads named as input/query responsibilities while
    leaving the packing algorithm and result persistence in the packing
    execution flow.
    """

    @staticmethod
    def get_latest_layout():
        return SpaceDesignReadFacade.get_latest_cutting_layout()

    @staticmethod
    def list_items_for_zone(zone_id):
        all_items = []
        group_ids = AllocationReadFacade.list_group_ids_for_zone(zone_id)
        for group_id in group_ids:
            all_items.extend(
                InventoryAccessFacade.list_enriched_inventory(group_id=group_id)
            )
        return all_items
