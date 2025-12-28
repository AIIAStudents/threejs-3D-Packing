# run_flask.py
from flask import Flask, jsonify
from threading import Thread
import webbrowser
import time

app = Flask(__name__)

@app.route('/api/status')
def status():
    return jsonify({"status": "Flask server is running."})

def start_flask_server():
    def run_server():
        app.run(debug=False, port=8888, use_reloader=False)

    server_thread = Thread(target=run_server)
    server_thread.daemon = True
    server_thread.start()

    # 等待 server 啟動
    time.sleep(1)
    print("✅ Flask server is running at http://localhost:8888")

    # 自動開啟前端頁面（請替換成你的 Three.js 頁面路徑）
    webbrowser.open("http://localhost:8888")

if __name__ == "__main__":
    start_flask_server()