from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List
import json
import logging

# استدعاء راوتر الواتساب من ملف auth.py
from auth import router as auth_router

# إعداد الـ Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ChatBackend")

app = FastAPI()

# تفعيل الـ CORS عشان السيرفر يقبل طلبات من رابط Fly.io
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # بيسمح لأي رابط يكلم السيرفر
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ربط مسارات الواتساب (auth.py) بالملف الأساسي
app.include_router(auth_router)

# مدير الاتصالات (WebSockets)
class ConnectionManager:
    def __init__(self):
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
        if room_id in self.active_connections:
            payload = json.dumps({"sender": sender, "message": message})
            for connection in self.active_connections[room_id]:
                await connection.send_text(payload)

manager = ConnectionManager()

@app.get("/api/status")
async def status():
    return {"status": "Platform is running perfectly on Fly.io 2026!", "engine": "FastAPI"}

@app.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await manager.connect(room_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(room_id, data, user_id)
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        await manager.broadcast(room_id, f"غادر المستخدم {user_id}", "System")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
