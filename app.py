from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # للسماح للموقع بالتواصل مع السيرفر

# مفتاح الحماية الأمني للربط بين الموقع والـ API
WEBHOOK_SECRET = "HERTZ_ULTRA_SECURE_2026_X9kLmPq2NvR8sT"

# قاعدة بيانات مؤقتة للمحظورين
banned_users_db = {}

# قاعدة بيانات مؤقتة للمنتجات (يمكن تحديثها لتخزين دائم لاحقاً)
products_db = []

# ==========================================
# 🛑 مسارات الحظر القديمة (بدون أي تغيير لضمان عدم كسر الربط)
# ==========================================

@app.route('/check-ban', methods=['GET'])
def check_ban():
    secret = request.headers.get('X-Hertz-Secret')
    if secret != WEBHOOK_SECRET:
        return jsonify({"error": "Unauthorized"}), 403
    
    phone = request.args.get('phone', '')
    user_code = request.args.get('user_code', '')
    
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


# ==========================================
# 🛒 مسارات إدارة المنتجات الجديدة (الربط بين الأدمن والزوار)
# ==========================================

@app.route('/api/products', methods=['GET'])
def get_products():
    # متاح للجميع (الزوار والأدمن) لجلب المنتجات الحالية
    return jsonify({"success": True, "products": products_db})

@app.route('/api/products', methods=['POST'])
def save_products():
    # محمي بمفتاح الحماية عشان الأدمن بس اللي يقعد يبعت ويعدل
    secret = request.headers.get('X-Hertz-Secret')
    if secret != WEBHOOK_SECRET:
        return jsonify({"error": "Unauthorized"}), 403
    
    data = request.json
    global products_db
    # استقبال القائمة الكاملة للمنتجات المحدثة من لوحة الأدمن وحفظها
    if isinstance(data, list):
        products_db = data
        return jsonify({"success": True, "message": "Products updated successfully", "count": len(products_db)})
    elif isinstance(data, dict) and "products" in data:
        products_db = data["products"]
        return jsonify({"success": True, "message": "Products updated successfully", "count": len(products_db)})
    
    return jsonify({"error": "Invalid data format"}), 400


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
