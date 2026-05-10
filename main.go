package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"runtime"
	"sync"

	"github.com/pion/webrtc/v4"
)

// ==========================================
// 1. الهياكل الأساسية (البيانات)
// ==========================================

// Peer يمثل مستخدم واحد داخل المكالمة
type Peer struct {
	ID             string
	PeerConnection *webrtc.PeerConnection
	Tracks         []*webrtc.TrackLocalStaticRTP // المسارات الصوتية/المرئية الخاصة به
}

// Room تمثل غرفة (مجموعة أو محادثة خاصة)
type Room struct {
	ID    string
	Peers map[string]*Peer
	Mutex sync.RWMutex // لمنع تداخل البيانات لما كذا يوزر يدخلوا في نفس اللحظة
}

// RoomManager مدير الغرف الشامل
type RoomManager struct {
	Rooms map[string]*Room
	Mutex sync.RWMutex
}

// إنشاء المدير العام للغرف
var manager = &RoomManager{
	Rooms: make(map[string]*Room),
}

// ==========================================
// 2. دوال إدارة الغرف والأعضاء
// ==========================================

// الحصول على غرفة أو إنشاؤها لو مش موجودة
func (m *RoomManager) GetOrCreateRoom(roomID string) *Room {
	m.Mutex.Lock()
	defer m.Mutex.Unlock()

	room, exists := m.Rooms[roomID]
	if !exists {
		fmt.Printf("🏠 تم إنشاء غرفة جديدة: %s\n", roomID)
		room = &Room{
			ID:    roomID,
			Peers: make(map[string]*Peer),
		}
		m.Rooms[roomID] = room
	}
	return room
}

// إضافة عضو للغرفة وتوزيع صوته على الباقي
func (r *Room) AddPeer(peerID string, pc *webrtc.PeerConnection) *Peer {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	peer := &Peer{
		ID:             peerID,
		PeerConnection: pc,
	}
	r.Peers[peerID] = peer
	fmt.Printf("👤 المستخدم [%s] انضم للغرفة [%s]\n", peerID, r.ID)
	return peer
}

// إزالة عضو من الغرفة
func (r *Room) RemovePeer(peerID string) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	delete(r.Peers, peerID)
	fmt.Printf("👋 المستخدم [%s] غادر الغرفة [%s]\n", peerID, r.ID)
}

// ==========================================
// 3. المحرك الأساسي (SFU Logic) - توزيع الميديا
// ==========================================

// هذه الدالة هي القلب النابض: تأخذ صوت/فيديو شخص وتوزعه للجميع في الغرفة
func (r *Room) BroadcastTrack(newTrack *webrtc.TrackRemote, receiver *webrtc.RTPReceiver, senderPeerID string) {
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()

	// إنشاء مسار محلي جديد بنفس خصائص المسار القادم
	localTrack, err := webrtc.NewTrackLocalStaticRTP(newTrack.Codec().RTPCodecCapability, newTrack.ID(), newTrack.StreamID())
	if err != nil {
		log.Println("❌ خطأ في إنشاء المسار المحلي:", err)
		return
	}

	// تشغيل لوب يقرأ البيانات من اليوزر ويبثها للمسار المحلي
	go func() {
		rtpBuf := make([]byte, 1400)
		for {
			i, _, readErr := newTrack.Read(rtpBuf)
			if readErr != nil {
				return // اليوزر قفل المكالمة
			}
			// التعديل تم هنا: إضافة _, قبل writeErr لاستقبال القيمتين
			if _, writeErr := localTrack.Write(rtpBuf[:i]); writeErr != nil && writeErr != io.ErrClosedPipe {
				return
			}
		}
	}()

	// إضافة هذا المسار لكل الأعضاء التانيين في الغرفة
	for _, peer := range r.Peers {
		if peer.ID != senderPeerID {
			_, err = peer.PeerConnection.AddTrack(localTrack)
			if err != nil {
				log.Println("❌ خطأ في إرسال الميديا للمستخدم:", peer.ID, err)
			}
		}
	}
}

// ==========================================
// 4. خادم الـ API (الربط مع الواجهة)
// ==========================================

// هيكل البيانات المستلمة من المتصفح
type SDPMessage struct {
	RoomID string                    `json:"room_id"`
	UserID string                    `json:"user_id"`
	SDP    webrtc.SessionDescription `json:"sdp"`
}

func sdpHandler(w http.ResponseWriter, req *http.Request) {
	// السماح للواجهة بالاتصال (CORS)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if req.Method == "OPTIONS" {
		return
	}

	var msg SDPMessage
	if err := json.NewDecoder(req.Body).Decode(&msg); err != nil {
		http.Error(w, "بيانات غير صالحة", http.StatusBadRequest)
		return
	}

	// إعدادات محرك Pion WebRTC
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	}

	// إنشاء اتصال جديد للمستخدم
	peerConnection, err := webrtc.NewPeerConnection(config)
	if err != nil {
		log.Println("❌ فشل إنشاء اتصال:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// الحصول على الغرفة أو إنشاؤها
	room := manager.GetOrCreateRoom(msg.RoomID)
	peer := room.AddPeer(msg.UserID, peerConnection)

	// لما المستخدم يبعت صوت أو فيديو، وزعه على الغرفة
	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		fmt.Printf("🎙️ استلام مسار ميديا جديد من [%s] في الغرفة [%s]\n", peer.ID, room.ID)
		room.BroadcastTrack(track, receiver, peer.ID)
	})

	// مراقبة حالة الاتصال (لو اليوزر فصل النت، شيله من الغرفة)
	peerConnection.OnICEConnectionStateChange(func(connectionState webrtc.ICEConnectionState) {
		if connectionState == webrtc.ICEConnectionStateDisconnected || connectionState == webrtc.ICEConnectionStateFailed || connectionState == webrtc.ICEConnectionStateClosed {
			room.RemovePeer(peer.ID)
		}
	})

	// استقبال الـ Offer من المتصفح
	if err := peerConnection.SetRemoteDescription(msg.SDP); err != nil {
		log.Println("❌ خطأ في الـ Remote Description:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// إنشاء الرد (Answer) للمتصفح
	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		log.Println("❌ خطأ في إنشاء الرد:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err = peerConnection.SetLocalDescription(answer); err != nil {
		log.Println("❌ خطأ في الـ Local Description:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// إرسال الرد للواجهة
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(answer)
}

// ==========================================
// 5. التشغيل
// ==========================================
func main() {
	// إجبار المحرك على استخدام كل أنوية السيرفر (10 كور)
	runtime.GOMAXPROCS(runtime.NumCPU())
	fmt.Printf("🚀 محرك المكالمات 2026 يعمل بكامل قوته على %d أنوية!\n", runtime.NumCPU())

	// تشغيل الـ API
	http.HandleFunc("/join", sdpHandler)

	fmt.Println("🎧 السيرفر مستعد لاستقبال المكالمات على البورت 8081...")
	log.Fatal(http.ListenAndServe(":8081", nil))
}
