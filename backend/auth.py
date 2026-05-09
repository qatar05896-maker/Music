import random
import requests
from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
from pydantic import BaseModel

# إنشاء راوتر لربطه بملف main.py بسهولة
router = APIRouter()

# بيانات ميتا الخاصة بك (تم دمج الأرقام والتوكن الخاص بك)
WHATSAPP_API_URL = "https://graph.facebook.com/v19.0/1065472709991832/messages"
ACCESS_TOKEN = "EAAeOrQ27bTYBRcISA8dw1GNOpgkTz1l4zgwRjRdeA4DzHpZBzVpWGDA4Wf7DKigZAOszKWvHPLADeIGrblHnH6H6PcfvQnvPDLPxueXZAdlZAWyoDCru76mzPyciCL17LZCbDYduZAe4Aku2ZArNhJbra3k24XULhsBuW45UqNCcEGvMPrTFnbyBZCNO5ZC8HXvGZAAm0IJmomUKzZBSQwOesNNVHslly1EnqjSiffuFXoPtmrG5BXwDaKdMbQx0LPVWPbp6Q8AMdQAjnNSWjE36ZBSNipZBFIo1CUFWMPLQZD"

# ذاكرة مؤقتة لحفظ الأكواد (رقم التليفون: الكود ووقت الانتهاء)
otp_store = {}

# نماذج البيانات (Pydantic) عشان FastAPI يفهم الطلبات اللي جاية من الموقع
class PhoneRequest(BaseModel):
    phone_number: str

class VerifyRequest(BaseModel):
    phone_number: str
    otp: str

def generate_otp():
    """توليد كود من 6 أرقام"""
    return str(random.randint(100000, 999999))

def send_whatsapp_message(phone_number: str, message_body: str):
    """إرسال الرسالة النصية عبر API ميتا الرسمي"""
    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone_number,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": message_body
        }
    }
    
    response = requests.post(WHATSAPP_API_URL, json=payload, headers=headers)
    if response.status_code == 200:
        return True
    else:
        print("❌ Meta Error:", response.text)
        return False

# ==========================================
# 1. مسار طلب كود الواتساب
# ==========================================
@router.post("/api/auth/request")
async def request_otp(data: PhoneRequest):
    # التأكد إن الرقم بيبدأ بكود الدولة (مثال: 2010...)
    phone_number = data.phone_number.strip()
    if not phone_number.startswith("20"):
        # لو اليوزر نسي كود الدولة، بنضيفهوله أوتوماتيك (لمصر)
        phone_number = "20" + phone_number.lstrip("0")
        
    otp = generate_otp()
    message = f" كود الدخول الخاص بك في منصة البث هو: *{otp}*\n\nالرجاء عدم مشاركة الكود مع أحد."
    
    if send_whatsapp_message(phone_number, message):
        # حفظ الكود وتحديد مدة صلاحية (5 دقائق)
        otp_store[phone_number] = {
            "otp": otp,
            "expires": datetime.now() + timedelta(minutes=5)
        }
        return {"status": "success", "message": "تم إرسال الكود بنجاح إلى واتساب."}
    else:
        raise HTTPException(status_code=500, detail="فشل إرسال الكود. يرجى التأكد من إرسال رسالة لرقم البوت أولاً لفتح المحادثة.")

# ==========================================
# 2. مسار التحقق من الكود
# ==========================================
@router.post("/api/auth/verify")
async def verify_otp(data: VerifyRequest):
    phone_number = data.phone_number.strip()
    if not phone_number.startswith("20"):
        phone_number = "20" + phone_number.lstrip("0")
        
    user_otp = data.otp
    record = otp_store.get(phone_number)
    
    if not record:
        return {"status": "error", "message": "لم يتم طلب كود لهذا الرقم أو انتهت الصلاحية."}
    
    if record["otp"] == user_otp and datetime.now() < record["expires"]:
        # مسح الكود بعد الاستخدام لمنع إعادة الاستخدام
        del otp_store[phone_number]
        return {"status": "success", "message": "تم التحقق بنجاح!"}
    
    return {"status": "error", "message": "الكود خاطئ أو انتهت صلاحيته."}
