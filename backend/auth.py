import random
from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
from pydantic import BaseModel
from pyrogram import Client
from pyrogram.errors import RPCError

# إنشاء الراوتر لربطه بملف main.py
router = APIRouter()

# ==========================================
# بيانات تيليجرام (Kurigram / Pyrogram)
# ==========================================
API_ID = 29124455
API_HASH = "3530cc0b47abc8aa0705634c15de1ba7"
SESSION_STRING = "BAG8Z2cAJnc_5AvaCGFCFNEECCl3IoQRr2WtSNyaFVomFSV0hquQOgkWt4hcEp3sS9fseLuQaqKXaw2StqJEd-LrcfoiU69ofIUbCo16GuNgxruxMFsFeYGLes5AThCIK5JoimJDu1sDO1ZviPzUIOE3nSP99p3x7y2PXzbts62ZG_ze4vNZrJKab1e1hG-SmkPkpEY-bB9n8nwJmTr-dvV3MJeaH0UgiSyvR1Emzpe62mAiowF5tmiGZgTgK3WADkWSsb00oOGjs2H8btQnfKD7fs6B_gMMzqdDiTgBeQPxRsEEQn1ZSGRfK7zDmq6bOVNv_-aEHuf0tuLbr0pLPubg556HQgAAAAHSHlHnAA"

# تهيئة عميل Kurigram باستخدام الـ Session String
client = Client(
    name="otp_bot",
    api_id=API_ID,
    api_hash=API_HASH,
    session_string=SESSION_STRING
)

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

async def send_telegram_message(phone_number: str, message_body: str):
    """إرسال الرسالة عبر تيليجرام باستخدام Kurigram"""
    # التأكد من أن العميل متصل
    if not client.is_connected:
        await client.connect()
        
    # تيليجرام يحتاج إلى علامة + قبل رقم الهاتف الدولي
    tg_phone = f"+{phone_number}"
    
    try:
        # إرسال الرسالة للرقم
        await client.send_message(tg_phone, message_body)
        return True
    except RPCError as e:
        # طباعة خطأ تيليجرام في سجلات السيرفر
        print(f"❌ Kurigram API Error: {e}")
        return False
    except Exception as e:
        # طباعة أي أخطاء أخرى
        print(f"❌ General Error: {e}")
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
    message = f"كود الدخول الخاص بك في منصة البث هو: **{otp}**\n\nالرجاء عدم مشاركة الكود مع أحد."
    
    # إرسال الرسالة عبر تيليجرام
    is_sent = await send_telegram_message(phone, message)
    
    if is_sent:
        # حفظ الكود بمدة صلاحية 5 دقائق
        otp_store[phone] = {
            "otp": otp,
            "expires": datetime.now() + timedelta(minutes=5)
        }
        return {"status": "success", "message": "تم إرسال الكود إلى تيليجرام بنجاح."}
    else:
        # في حالة فشل الإرسال (الرقم غير مسجل، أو حسابك يحتاج لإضافة الرقم لجهات الاتصال أولاً)
        raise HTTPException(
            status_code=500, 
            detail="فشل إرسال الكود. تأكد من أن الرقم مسجل على تيليجرام أو قمت بمراسلة الحساب مسبقاً."
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
        return {"status": "error", "message": "الكود الذي أدخلته غير صحيح."}
