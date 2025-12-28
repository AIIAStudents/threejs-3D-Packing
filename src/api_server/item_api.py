
from flask import request, jsonify
import traceback

# Assuming the src path is already added to sys.path in the main api.py
from db import dao

def create_item_routes(app):
    @app.route('/api/items/batch', methods=['POST'])
    def batch_add_items():
        """
        Batch add items to the inventory.
        Expects a JSON payload like:
        {
          "group_id": 1,
          "status": "尚未確認",
          "items": [
            { "name": "Cube", "quantity": 5 },
            { "name": "Sphere", "quantity": 3 }
          ]
        }
        """
        try:
            data = request.get_json()
            if not data:
                return jsonify({"status": "error", "message": "Invalid JSON"}), 400

            group_id = data.get('group_id')
            status = data.get('status')
            items = data.get('items')

            if not all([group_id, status, items is not None]):
                return jsonify({"status": "error", "message": "Missing group_id, status, or items"}), 400

            items_to_add = []
            for item_order in items:
                name = item_order.get('name')
                quantity = item_order.get('quantity')

                if not name or not isinstance(quantity, int) or quantity <= 0:
                    return jsonify({"status": "error", "message": f"Invalid item order: {item_order}"}), 400

                item_type_id = dao.get_item_type_by_name(name)
                if item_type_id is None:
                    return jsonify({"status": "error", "message": f"Item type '{name}' not found"}), 404
                
                for _ in range(quantity):
                    items_to_add.append({
                        "item_type_id": item_type_id,
                        "group_id": group_id,
                        "status": status
                    })
            
            if not items_to_add:
                return jsonify({"status": "success", "message": "No items to add."}), 200

            result = dao.batch_add_inventory_items(items_to_add)

            if result.get("status") == "success":
                return jsonify(result), 201
            else:
                return jsonify(result), 500

        except Exception as e:
            traceback.print_exc()
            return jsonify({"status": "error", "message": str(e)}), 500
