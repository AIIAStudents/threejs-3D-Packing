# src/api_server/group_api.py

import datetime
import sqlite3
import traceback
from flask import request, jsonify
from apscheduler.schedulers.background import BackgroundScheduler

# 導入 DAO
from db import dao

def create_group_routes(app):
    """將群組與庫存管理相關的 API 路由註冊到 Flask app 上"""

    @app.route('/groups/update-order', methods=['POST', 'OPTIONS'])
    def update_group_order_api():
        if request.method == 'OPTIONS':
            return '', 200
        data = request.get_json()
        if not data or not isinstance(data, list):
            return jsonify({"error": "請求主體必須是一個包含 group ID 的陣列"}), 400
        
        result = dao.update_group_order(data)
        if result["status"] == "success":
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    @app.route('/groups', methods=['POST', 'OPTIONS'])
    def create_group_api():
        if request.method == 'OPTIONS':
            return '', 200
        data = request.get_json()
        if not data or 'name' not in data:
            return jsonify({"error": "缺少群組名稱(name)"}), 400
        
        group_id = dao.create_group(
            name=data['name'],
            packing_time=data.get('packingTime'),
            reserve_for_delayed=data.get('reserveForDelayed', 0.1),
            allow_repack=data.get('allowRepack', 1),
            exit_priority=data.get('exitPriority', 0)
        )
        new_group = dao.get_group(group_id)
        if new_group:
            return jsonify(new_group), 201
        else:
            return jsonify({"error": "創建群組後無法檢索該群組"}), 500
        
    # 取得所有群組的 API
    @app.route('/groups', methods=['GET', 'OPTIONS'])
    def get_groups_api():
        if request.method == 'OPTIONS':
            return '', 200
        groups = dao.get_all_groups()
        return jsonify(groups)

    # 取得單一群組的 API
    @app.route('/groups/<int:group_id>', methods=['GET'])
    def get_group_api(group_id):
        group = dao.get_group(group_id)
        if group:
            return jsonify(group)
        else:
            return jsonify({"error": "找不到該群組"}), 404

    # 更新群組的 API
    @app.route('/groups/<int:group_id>', methods=['PUT', 'OPTIONS'])
    def update_group_api(group_id):
        if request.method == 'OPTIONS':
            return '', 200
        data = request.get_json()
        if not data:
            return jsonify({"error": "缺少更新資料"}), 400
        
        # Assuming dao.update_group exists
        updated_group = dao.update_group(group_id, data)
        if updated_group:
            return jsonify(updated_group)
        else:
            return jsonify({"error": "找不到該群組或更新失敗"}), 404

    # 刪除群組的 API
    @app.route('/groups/<int:group_id>', methods=['DELETE', 'OPTIONS'])
    def delete_group_api(group_id):
        if request.method == 'OPTIONS':
            return '', 200
        
        # Assuming dao.delete_group exists
        success = dao.delete_group(group_id)
        if success:
            return jsonify({"message": f"群組 {group_id} 已成功刪除"}), 200
        else:
            return jsonify({"error": "找不到該群組或刪除失敗"}), 404
        
    # 取得特定群組的所有庫存物品
    @app.route('/groups/<int:group_id>/items', methods=['GET'])
    def get_group_items_api(group_id):
        status_filter = request.args.get('status')
        items = dao.get_inventory_items_by_group(group_id, status_filter=status_filter)
        return jsonify(items)

    
    # 新增庫存物品的 API
    @app.route('/inventory_items', methods=['POST', 'OPTIONS'])
    def add_inventory_item_api():
        if request.method == 'OPTIONS':
            return '', 200
        data = request.get_json()

        if not data or 'item_type_id' not in data or 'group_id' not in data:
            return jsonify({"error": "缺少 item_type_id 或 group_id"}), 400

        try:
            item_id = dao.add_item_to_inventory(
                data['item_type_id'],
                data['group_id'],
                data.get('deadline')
            )

            # Fetch the full item object after creating it
            new_item = dao.get_inventory_item(item_id)
            if new_item:
                return jsonify(new_item), 201
            else:
                return jsonify({"error": "創建物品後無法檢索該物品"}), 500
        except sqlite3.Error as e:
            return jsonify({"error": f"資料庫錯誤: {e}"}), 500
        except Exception as e:
            print("🔥 伺服器內部錯誤:", e)
            traceback.print_exc()   # 將錯誤堆疊到 console
            return jsonify({"error": f"伺服器內部錯誤: {e}"}), 500  
       
    # 刪除庫存物品的 API     
    @app.route('/inventory_items/<int:item_id>', methods=['DELETE', 'OPTIONS'])
    def delete_inventory_item_api(item_id):
        if request.method == 'OPTIONS':
            return '', 200
        try:
            success = dao.delete_inventory_item(item_id)  # dao.py 裡定義
            if success:
                return jsonify({"message": f"物品 {item_id} 已刪除"}), 200
            else:
                return jsonify({"error": "找不到該物品或刪除失敗"}), 404
        except sqlite3.Error as e:
            return jsonify({"error": f"資料庫錯誤: {e}"}), 500
        except Exception as e:
            return jsonify({"error": f"伺服器內部錯誤: {e}"}), 500
        
    # 更新庫存物品的 API    
    @app.route('/inventory_items/<int:item_id>', methods=['PUT', 'OPTIONS'])
    def update_inventory_item_api(item_id):
        if request.method == 'OPTIONS':
            return '', 200
        data = request.get_json()

        if not data:
            return jsonify({"error": "缺少更新資料"}), 400

        try:
            updated_item = dao.update_inventory_item(item_id, data)
            if updated_item:
                return jsonify(updated_item), 200
            else:
                return jsonify({"error": "找不到該物品"}), 404
        except sqlite3.Error as e:
            return jsonify({"error": f"資料庫錯誤: {e}"}), 500
        except Exception as e:
            return jsonify({"error": f"伺服器內部錯誤: {e}"}), 500