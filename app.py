from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # للسماح للموقع بالتواصل مع السيرفر

# مفتاح الحماية الأمني للربط بين الموقع والـ API
WEBHOOK_SECRET = "HERTZ_ULTRA_SECURE_2026_X9kLmPq2NvR8sT"

# قاعدة بيانات مؤقتة (يمكن استبدالها بقاعدة بيانات حقيقية مثل SQLite أو MongoDB)
banned_users_db = {}

@app.route('/check-ban', methods=['GET'])
def check_ban():
    secret = request.headers.get('X-Hertz-Secret')
    if secret != WEBHOOK_SECRET:
        return jsonify({"error": "Unauthorized"}), 403
    
    phone = request.args.get('phone', '')
    user_code = request.args.get('user_code', '')
    
    # البحث عن المستخدم في قائمة المحظورين
    user_key = phone if phone else user_code
    if user_key in banned_users_db:
        return jsonify({
            "banned": True,
            "ban_info": banned_users_db[user_key]
        })
    
    return jsonify({"banned": False})

@app.route('/ban-user', methods=['POST'])
def ban_user():
    secret = request.headers.get('X-Hertz-Secret')
    if secret != WEBHOOK_SECRET:
        return jsonify({"error": "Unauthorized"}), 403
    
    data = request.json
    user_key = data.get('phone') or data.get('user_code')
    
    if not user_key:
        return jsonify({"error": "Missing user identifier"}), 400
        
    banned_users_db[user_key] = {
        "reason": data.get('reason', 'مخالفة شروط الاستخدام'),
        "banned_at": data.get('banned_at')
    }
    
    return jsonify({"success": True, "message": "User banned successfully"})

@app.route('/unban-request', methods=['POST'])
def unban_request():
    secret = request.headers.get('X-Hertz-Secret')
    if secret != WEBHOOK_SECRET:
        return jsonify({"error": "Unauthorized"}), 403
    
    data = request.json
    print(f"طلب فك حظر من: {data.get('username')}")
    
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)