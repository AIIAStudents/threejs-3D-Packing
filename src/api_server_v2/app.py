"""
Main Flask Application Entry Point
Coordinates all API blueprints and database initialization
"""
from flask import Flask, jsonify
from flask_cors import CORS
from src.api_server_v2.init_db import init_all_tables
from src.api_server_v2.sequence.sequence import sequence_api_blueprint
from src.api_server_v2.groups_items.groups_items import groups_items_api_blueprint
from src.api_server_v2.containers_zones.containers_zones import containers_zones_api_blueprint

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# ========== DATABASE INITIALIZATION ==========
# Initialize all database tables on startup (reset data)
print("\n" + "=" * 60)
print("  STARTING 3D PACKING API SERVER")
print("=" * 60)

try:
    init_all_tables()
except Exception as e:
    print(f"⚠️  Database initialization failed: {e}")
    print("=" * 60)

# ========== BLUEPRINT REGISTRATION ==========
# Register all API blueprints with their URL prefixes
app.register_blueprint(sequence_api_blueprint, url_prefix='/api/sequence')
app.register_blueprint(groups_items_api_blueprint, url_prefix='/api')
app.register_blueprint(containers_zones_api_blueprint, url_prefix='/api')

print("\n📋 Registered API Blueprints:")
print("   - /api/sequence/*        (Packing sequence operations)")
print("   - /api/groups/*          (Group management)")
print("   - /api/items/*           (Item management)")
print("   - /api/containers/*      (Container configuration)")
print("   - /api/zones/*           (Zone management)")
print("   - /api/zone-assignments/* (Zone-Group assignments)")
print("=" * 60 + "\n")

# ========== STATUS ENDPOINT ==========
@app.route('/api/v2/status', methods=['GET'])
@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok", 
        "message": "3D Packing API is running",
        "version": "2.0"
    })

# ========== SERVER EXECUTION ==========
if __name__ == '__main__':
    print("🚀 Server starting on http://0.0.0.0:8888")
    print("   Press CTRL+C to stop")
    print("=" * 60 + "\n")
    app.run(host='0.0.0.0', port=8888, debug=True)
