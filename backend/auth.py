import random
import requests
from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
from pydantic import BaseModel

# إنشاء الراوتر لربطه بملف main.py
router = APIRouter()

# ==========================================
# بيانات ميتا الرسمية (تحديث 2026)
# ==========================================
WHATSAPP_API_URL = "https://graph.facebook.com/v19.0/1065472709991832/messages"

# التوكن الجديد الخاص بك (صالح لمدة 24 ساعة في وضع الاختبار)
ACCESS_TOKEN = "EAAeOrQ27bTYBRRlzn06oRbJu3Ld1x855GWzweOxpmZCenAi0MI8SQ4GmSfrz4tiZAEBsPq2ZA6rk0cVx3bHYZCOaZBpYJaylOqBocr78YIQGQ4yCAnb0YMz3lYqDYZAlJjkEMuSQUcuvBBIkPfrGiHwDh9tX80xYcTXQntZAdnQKTUFZB7L3c7vHcPqEznjx6OjilXuh3NGTO65vo1dG4G3p6yGnv534hyl1g8KqFb0miI6Fl9RHLHpxHeKQmcCDuQ4ZD"

# مخزن مؤقت للأكواد (رقم الهاتف: {الكود، وقت الانتهاء})
otp_store = {}

# نماذج البيانات لطلبات الـ API
class PhoneRequest(BaseModel):
    phone_number: str

class VerifyRequest(BaseModel):
    phone_number: str
    otp: str

def generate_otp():
    """توليد رمز مكون من 6 أرقام"""
    return str(random.randint(100000, 999999))

def send_whatsapp_message(phone_number: str, message_body: str):
    """إرسال الرسالة عبر API واتساب الرسمي"""
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
        # طباعة الخطأ في سجلات السيرفر (Fly Logs) لتسهيل التصحيح
        print(f"❌ Meta API Error: {response.status_code} - {response.text}")
        return False

# ==========================================
# 1. مسار طلب الكود (Request OTP)
# ==========================================
@router.post("/api/auth/request")
async def request_otp(data: PhoneRequest):
    phone = data.phone_number.strip()
    
    # تنظيف الرقم والتأكد من وجود كود الدولة (مصر 20)
    if not phone.startswith("20"):
        # إزالة الصفر الأول لو موجود وإضافة 20
        phone = "20" + phone.lstrip("0")
        
    otp = generate_otp()
    # الرسالة بدون إيموجي كما طلبت
    message = f"كود التحقق الخاص بك هو: {otp}. الرجاء عدم مشاركته مع اي شخص."
    
    if send_whatsapp_message(phone, message):
        # حفظ الكود بمدة صلاحية 5 دقائق
        otp_store[phone] = {
            "otp": otp,
            "expires": datetime.now() + timedelta(minutes=5)
        }
        return {"status": "success", "message": "تم ارسال الكود الى واتساب بنجاح."}
    else:
        # في حالة فشل ميتا في الإرسال
        raise HTTPException(
            status_code=500, 
            detail="فشل ارسال الكود. تاكد من صلاحية التوكن او انك بدأت المحادثة مع البوت اولا."
        )

# ==========================================
# 2. مسار التحقق من الكود (Verify OTP)
# ==========================================
@router.post("/api/auth/verify")
async def verify_otp(data: VerifyRequest):
    phone = data.phone_number.strip()
    if not phone.startswith("20"):
        phone = "20" + phone.lstrip("0")
        
    user_otp = data.otp
    record = otp_store.get(phone)
    
    # التأكد من وجود سجل للرقم وعدم انتهاء الصلاحية
    if not record:
        return {"status": "error", "message": "لم يتم طلب كود لهذا الرقم."}
    
    if datetime.now() > record["expires"]:
        del otp_store[phone]
        return {"status": "error", "message": "انتهت صلاحية الكود."}
    
    if record["otp"] == user_otp:
        # مسح الكود بعد التحقق بنجاح لمنع استخدامه مرة أخرى
        del otp_store[phone]
        return {"status": "success", "message": "تم التحقق بنجاح."}
    else:
        return {"status": "error", "message": "الكود الذي ادخلته غير صحيح."}
