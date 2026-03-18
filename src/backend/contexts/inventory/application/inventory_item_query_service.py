from src.backend.contexts.inventory.infrastructure.inventory_item_repository import (
    InventoryItemRepository,
)
from src.backend.shared.db.sqlite import db_session


class InventoryItemQueryService:
    @staticmethod
    def list_items(group_id=None):
        with db_session() as conn:
            return InventoryItemRepository.list_items(conn, group_id)
