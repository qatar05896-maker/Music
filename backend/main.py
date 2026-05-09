from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, List
import json
import logging

# إعداد الـ Logging لمتابعة رسايل الشات والأخطاء
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ChatBackend")

app = FastAPI()

# مدير الاتصالات: بيحفظ مين فاتح شات في أنهي غرفة
class ConnectionManager:
    def __init__(self):
        # Dictionary: {room_id: [websocket1, websocket2, ...]}
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        logger.info(f"👤 مستخدم جديد انضم للغرفة: {room_id}")

    def disconnect(self, room_id: str, websocket: WebSocket):
        self.active_connections[room_id].remove(websocket)
        if not self.active_connections[room_id]:
            del self.active_connections[room_id]
        logger.info(f"👋 مستخدم غادر الغرفة: {room_id}")

    async def broadcast(self, room_id: str, message: str, sender: str):
        # إرسال الرسالة لكل الناس اللي في نفس الغرفة
        if room_id in self.active_connections:
            payload = json.dumps({"sender": sender, "message": message})
            for connection in self.active_connections[room_id]:
                await connection.send_text(payload)

manager = ConnectionManager()

# ==========================================
# 1. API Status Endpoint
# ==========================================
@app.get("/api/status")
async def status():
    return {"status": "Platform is running perfectly 2026!", "engine": "FastAPI"}

# ==========================================
# 2. WebSocket Endpoint للدردشة
# ==========================================
@app.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await manager.connect(room_id, websocket)
    try:
        while True:
            # استقبال رسالة من المتصفح
            data = await websocket.receive_text()
            # بث الرسالة لكل الأعضاء في الغرفة
            await manager.broadcast(room_id, data, user_id)
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        await manager.broadcast(room_id, f"غادر المستخدم {user_id}", "System")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
