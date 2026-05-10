/**
 * ============================================================================
 * Platform 2026 - Ultra-Low Latency WebRTC Engine (Go/Pion Backend)
 * Capabilities: 4K@60FPS Video, 48kHz Stereo Audio, Sub-50ms Latency
 * ============================================================================
 */

const RTCConfig = {
    // إعدادات الاتصال للوصول لأقل Latency ممكن
    peerConnection: {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceTransportPolicy: "all"
    },
    // إعدادات 4K 60FPS وصوت استيريو
    mediaConstraints: {
        video: {
            width: { ideal: 3840, max: 3840 },
            height: { ideal: 2160, max: 2160 },
            frameRate: { ideal: 60, max: 60 },
            facingMode: "user" // الكاميرا الأمامية افتراضياً
        },
        audio: {
            channelCount: 2,         // Stereo Sound
            sampleRate: 48000,       // High-Res Audio
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    },
    SIGNALING_URL: window.location.protocol === 'https:' ? `https://${window.location.host}/join` : `http://${window.location.host}/join`
};

const RTCState = {
    pc: null,
    localStream: null,
    isMuted: false,
    isCamOff: false,
    currentFacingMode: "user",
    isInCall: false
};

const RTCUI = {
    elements: {
        videoSection: document.querySelector('.video-section'),
        localVideo: document.getElementById('localVideo'),
        remoteVideo: document.getElementById('remoteVideo'),
        btnMic: document.getElementById('btn-mic'),
        btnCam: document.getElementById('btn-cam'),
        btnFlip: document.getElementById('btn-flip')
    },

    toggleVideoUI: (show) => {
        if (!RTCUI.elements.videoSection) return;
        if (show) {
            RTCUI.elements.videoSection.style.display = 'flex';
            // تصغير الشات لو كنا فاتحين الكاميرا
            if(window.innerWidth > 768) {
                document.querySelector('.chat-section').style.flex = '1';
                RTCUI.elements.videoSection.style.flex = '2';
            } else {
                RTCUI.elements.videoSection.style.height = '50vh';
                document.querySelector('.chat-section').style.height = '50vh';
            }
        } else {
            RTCUI.elements.videoSection.style.display = 'none';
        }
    },

    updateMicBtn: () => {
        RTCUI.elements.btnMic.innerHTML = RTCState.isMuted ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
        RTCUI.elements.btnMic.classList.toggle('danger', RTCState.isMuted);
    },

    updateCamBtn: () => {
        RTCUI.elements.btnCam.innerHTML = RTCState.isCamOff ? '<i class="fa-solid fa-video-slash"></i>' : '<i class="fa-solid fa-video"></i>';
        RTCUI.elements.btnCam.classList.toggle('danger', RTCState.isCamOff);
    }
};

// ==========================================
// Core Engine Methods
// ==========================================
const RTCEngine = {
    initLocalStream: async () => {
        try {
            RTCState.localStream = await navigator.mediaDevices.getUserMedia(RTCConfig.mediaConstraints);
            RTCUI.elements.localVideo.srcObject = RTCState.localStream;
            RTCUI.elements.localVideo.muted = true; // نمنع صدى الصوت من جهازك
            return true;
        } catch (error) {
            console.error("[WebRTC] فشل الوصول للكاميرا/المايك:", error);
            alert("يرجى إعطاء صلاحيات الكاميرا والمايك لدخول المكالمة بأعلى جودة.");
            return false;
        }
    },

    createPeerConnection: () => {
        RTCState.pc = new RTCPeerConnection(RTCConfig.peerConnection);

        // إضافة المسارات (Tracks) للاتصال عشان تروح لسيرفر Go
        RTCState.localStream.getTracks().forEach(track => {
            RTCState.pc.addTrack(track, RTCState.localStream);
        });

        // استقبال الميديا من سيرفر Go (باقي الأعضاء)
        RTCState.pc.ontrack = (event) => {
            console.log("[WebRTC] استلام مسار ميديا جديد:", event.track.kind);
            if (RTCUI.elements.remoteVideo.srcObject !== event.streams[0]) {
                RTCUI.elements.remoteVideo.srcObject = event.streams[0];
            }
        };

        // مراقبة حالة الاتصال
        RTCState.pc.oniceconnectionstatechange = () => {
            console.log("[WebRTC] حالة الاتصال:", RTCState.pc.iceConnectionState);
            if (RTCState.pc.iceConnectionState === 'failed' || RTCState.pc.iceConnectionState === 'disconnected') {
                RTCEngine.endCall();
            }
        };
    },

    negotiateWithGoServer: async () => {
        try {
            const offer = await RTCState.pc.createOffer();
            await RTCState.pc.setLocalDescription(offer);

            // نكلم الـ API اللي عملناه بالـ Go
            const activeRoom = window.chatState ? window.chatState.activeRoom : 'global_room';
            const payload = {
                room_id: activeRoom,
                user_id: window.CURRENT_USER_PHONE || "unknown_user",
                sdp: RTCState.pc.localDescription
            };

            const response = await fetch(RTCConfig.SIGNALING_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("فشل الاتصال بمحرك Go");

            const answer = await response.json();
            await RTCState.pc.setRemoteDescription(answer);
            
            console.log("[WebRTC] تم الاتصال بمحرك Pion بنجاح 🚀 (Latency Optimized)");
        } catch (error) {
            console.error("[WebRTC] خطأ في التفاوض:", error);
            RTCEngine.endCall();
        }
    },

    endCall: () => {
        if (RTCState.pc) {
            RTCState.pc.close();
            RTCState.pc = null;
        }
        if (RTCState.localStream) {
            RTCState.localStream.getTracks().forEach(t => t.stop());
            RTCState.localStream = null;
        }
        RTCState.isInCall = false;
        RTCUI.toggleVideoUI(false);
        RTCUI.elements.remoteVideo.srcObject = null;
        RTCUI.elements.localVideo.srcObject = null;
        console.log("[WebRTC] تم إنهاء المكالمة");
    }
};

// ==========================================
// Global Controls (Exposed to HTML)
// ==========================================
window.startCall = async () => {
    if (RTCState.isInCall) return;
    
    const streamReady = await RTCEngine.initLocalStream();
    if (!streamReady) return;

    RTCUI.toggleVideoUI(true);
    RTCState.isInCall = true;

    RTCEngine.createPeerConnection();
    await RTCEngine.negotiateWithGoServer();
};

window.toggleMic = () => {
    if (!RTCState.localStream) return;
    RTCState.isMuted = !RTCState.isMuted;
    RTCState.localStream.getAudioTracks()[0].enabled = !RTCState.isMuted;
    RTCUI.updateMicBtn();
};

window.toggleCam = () => {
    if (!RTCState.localStream) return;
    RTCState.isCamOff = !RTCState.isCamOff;
    RTCState.localStream.getVideoTracks()[0].enabled = !RTCState.isCamOff;
    RTCUI.updateCamBtn();
};

window.flipCamera = async () => {
    if (!RTCState.localStream) return;
    
    // إيقاف الكاميرا الحالية
    const videoTrack = RTCState.localStream.getVideoTracks()[0];
    videoTrack.stop();
    RTCState.localStream.removeTrack(videoTrack);

    // التبديل
    RTCState.currentFacingMode = RTCState.currentFacingMode === "user" ? "environment" : "user";
    RTCConfig.mediaConstraints.video.facingMode = RTCState.currentFacingMode;

    try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: RTCConfig.mediaConstraints.video });
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        RTCState.localStream.addTrack(newVideoTrack);
        RTCUI.elements.localVideo.srcObject = RTCState.localStream;

        // تحديث المسار في سيرفر الـ Go بدون ما نفصل المكالمة
        if (RTCState.pc) {
            const sender = RTCState.pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(newVideoTrack);
            }
        }
    } catch (error) {
        console.error("[WebRTC] فشل تبديل الكاميرا:", error);
    }
};

// ==========================================
// Auto-hide video section on load
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    RTCUI.toggleVideoUI(false);
});

// Clean up on exit
window.addEventListener('beforeunload', RTCEngine.endCall);

/**
 * ============================================================================
 * End of webrtc.js
 * ============================================================================
 */
