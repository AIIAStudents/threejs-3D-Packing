CREATE VIEW items AS
SELECT 
    i.id,
    c.length,
    c.width,
    c.height,
    i.note,
    i.group_id,
    i.item_order
FROM inventory_items i
JOIN catalog_items c ON i.catalog_item_id = c.id;
