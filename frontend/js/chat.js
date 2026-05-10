const ChatConfig = {
    WS_BASE_URL: window.location.protocol === 'https:' ? `wss://${window.location.host}` : `ws://${window.location.host}`,
    WS_ENDPOINT: '/ws',
    MAIN_ROOM: 'global_room',
    STORAGE_KEY: 'platform_2026_chats',
    RECONNECT_DELAY: 3000,
    MAX_RECONNECT_ATTEMPTS: 10
};

class ChatEngineState {
    constructor() {
        this.currentUser = null;
        this.activeRoom = ChatConfig.MAIN_ROOM;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.contacts = [
            { id: ChatConfig.MAIN_ROOM, name: 'غرفة المحادثة العامة', type: 'group', members: 120, unread: 0, lastMessage: 'مرحباً بك في المنصة!', time: new Date().toISOString() }
        ];
        this.messages = {};
        this.loadHistory();
    }

    loadHistory() {
        try {
            const data = localStorage.getItem(ChatConfig.STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                this.messages = parsed.messages || {};
                if (parsed.contacts) {
                    parsed.contacts.forEach(c => {
                        if (!this.contacts.find(exist => exist.id === c.id)) this.contacts.push(c);
                    });
                }
            }
        } catch (e) {}
    }

    saveHistory() {
        try {
            localStorage.setItem(ChatConfig.STORAGE_KEY, JSON.stringify({
                contacts: this.contacts,
                messages: this.messages
            }));
        } catch (e) {}
    }

    addMessage(roomId, msgData) {
        if (!this.messages[roomId]) this.messages[roomId] = [];
        this.messages[roomId].push(msgData);
        this.saveHistory();
    }
}

const chatState = new ChatEngineState();

const ChatUI = {
    injectStyles: () => {
        const style = document.createElement('style');
        style.innerHTML = `
            .tg-chat-wrapper { display: flex; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: inherit; overflow: hidden; }
            .tg-sidebar { width: 320px; background: rgba(25, 25, 25, 0.6); border-left: 1px solid var(--glass-border); display: flex; flex-direction: column; transition: 0.3s; }
            .tg-search-bar { padding: 10px 15px; border-bottom: 1px solid var(--glass-border); display: flex; gap: 10px; align-items: center; }
            .tg-search-bar input { flex: 1; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 10px 15px; color: white; font-size: 14px; outline: none; }
            .tg-contacts { flex: 1; overflow-y: auto; }
            .tg-contacts::-webkit-scrollbar { width: 4px; }
            .tg-contacts::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); }
            .tg-contact-item { display: flex; align-items: center; padding: 10px 15px; cursor: pointer; transition: 0.2s; border-bottom: 1px solid rgba(255,255,255,0.03); }
            .tg-contact-item:hover { background: rgba(255,255,255,0.08); }
            .tg-contact-item.active { background: var(--ios-blue); }
            .tg-avatar { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #007AFF, #00C6FF); display: flex; align-items: center; justify-content: center; font-size: 20px; color: white; margin-left: 12px; font-weight: bold; }
            .tg-contact-info { flex: 1; overflow: hidden; }
            .tg-contact-name { font-weight: bold; font-size: 15px; margin-bottom: 4px; display: flex; justify-content: space-between; }
            .tg-contact-time { font-size: 11px; font-weight: normal; opacity: 0.7; }
            .tg-contact-lastmsg { font-size: 13px; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .tg-main { flex: 1; display: flex; flex-direction: column; background: url('https://www.transparenttextures.com/patterns/stardust.png') rgba(10, 10, 10, 0.8); position: relative; }
            .tg-header { padding: 10px 20px; background: rgba(25, 25, 25, 0.7); backdrop-filter: blur(10px); border-bottom: 1px solid var(--glass-border); display: flex; align-items: center; z-index: 10; cursor: pointer; }
            .tg-header-info h3 { margin-bottom: 2px; font-size: 16px; font-weight: 600; }
            .tg-header-status { font-size: 13px; color: var(--text-secondary); transition: color 0.3s; }
            .tg-header-status.online { color: var(--ios-blue); }
            .tg-voice-banner { display: none; background: rgba(52, 199, 89, 0.15); border-bottom: 1px solid rgba(52, 199, 89, 0.3); padding: 10px 20px; align-items: center; justify-content: space-between; backdrop-filter: blur(10px); cursor: pointer; transition: 0.2s; }
            .tg-voice-banner:hover { background: rgba(52, 199, 89, 0.25); }
            .tg-voice-banner.active { display: flex; }
            .tg-voice-banner-info { display: flex; align-items: center; gap: 15px; color: var(--ios-green); font-size: 14px; font-weight: bold; }
            .tg-voice-banner-btn { background: var(--ios-green); color: #fff; border: none; padding: 6px 15px; border-radius: 15px; font-weight: bold; cursor: pointer; }
            .tg-messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
            .tg-msg-wrap { display: flex; flex-direction: column; max-width: 80%; }
            .tg-msg-wrap.self { align-self: flex-end; }
            .tg-msg-wrap.other { align-self: flex-start; }
            .tg-msg-bubble { padding: 8px 12px; border-radius: 16px; font-size: 15px; line-height: 1.4; position: relative; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
            .tg-msg-wrap.self .tg-msg-bubble { background: var(--ios-blue); color: white; border-bottom-right-radius: 4px; }
            .tg-msg-wrap.other .tg-msg-bubble { background: rgba(35, 35, 35, 0.85); backdrop-filter: blur(10px); color: white; border-bottom-left-radius: 4px; }
            .tg-msg-meta { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; font-size: 11px; opacity: 0.7; margin-top: 2px; float: left; margin-right: 10px; }
            .tg-msg-wrap.self .tg-msg-meta { margin-right: 0; margin-left: 10px; float: right; }
            .tg-msg-sender { font-size: 13px; font-weight: bold; color: #00C6FF; margin-bottom: 2px; display: block; }
            .tg-msg-wrap.self .tg-msg-sender { display: none; }
            .tg-input-area { padding: 10px 15px; background: rgba(25, 25, 25, 0.85); backdrop-filter: blur(10px); border-top: 1px solid var(--glass-border); display: flex; align-items: flex-end; gap: 10px; }
            .tg-input-btn { background: none; border: none; color: var(--text-secondary); font-size: 24px; cursor: pointer; transition: 0.2s; padding: 10px; }
            .tg-input-btn:hover { color: var(--ios-blue); }
            .tg-input-area input { flex: 1; background: rgba(0, 0, 0, 0.3); border: 1px solid transparent; border-radius: 20px; padding: 12px 20px; color: white; font-size: 15px; outline: none; margin-bottom: 2px; }
            .tg-input-area input:focus { border-color: rgba(255,255,255,0.1); }
            .tg-send-btn { background: var(--ios-blue); color: white; border: none; width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer; transition: transform 0.2s; margin-bottom: 2px; }
            .tg-send-btn:active { transform: scale(0.9); }
            .system-msg { align-self: center; background: rgba(0, 0, 0, 0.3); padding: 4px 12px; border-radius: 12px; font-size: 12px; color: var(--text-secondary); margin: 5px 0; }
            @media(max-width: 768px) { .tg-sidebar { display: none; width: 100%; border-left: none; } .tg-sidebar.active-mobile { display: flex; position: absolute; z-index: 100; height: 100%; } .tg-msg-wrap { max-width: 90%; } }
        `;
        document.head.appendChild(style);
    },

    buildLayout: () => {
        const chatSection = document.querySelector('.chat-section');
        if (!chatSection) return;

        chatSection.innerHTML = `
            <div class="tg-chat-wrapper">
                <div class="tg-sidebar" id="tg-sidebar">
                    <div class="tg-search-bar">
                        <i class="fa-solid fa-bars" style="font-size: 20px; color: var(--text-secondary); cursor: pointer; padding: 5px;"></i>
                        <input type="tel" id="newChatInput" placeholder="بحث أو إدخال رقم...">
                    </div>
                    <div class="tg-contacts" id="contacts-list"></div>
                </div>

                <div class="tg-main">
                    <div class="tg-header" onclick="ChatUI.showChatInfo()">
                        <button class="tg-input-btn" style="padding:0; margin-left:15px; display:none;" id="mobile-back-btn" onclick="event.stopPropagation(); ChatUI.toggleMobileSidebar()">
                            <i class="fa-solid fa-arrow-right"></i>
                        </button>
                        <div class="tg-avatar" id="current-chat-avatar"><i class="fa-solid fa-users"></i></div>
                        <div class="tg-header-info" style="margin-right: 15px; flex:1;">
                            <h3 id="current-chat-name">غرفة المحادثة العامة</h3>
                            <span class="tg-header-status online" id="current-chat-status">120 عضو، 5 متصلون</span>
                        </div>
                        <i class="fa-solid fa-ellipsis-vertical" style="color: var(--text-secondary); padding: 10px; font-size: 20px;"></i>
                    </div>

                    <div class="tg-voice-banner" id="voice-chat-banner" onclick="window.startCall()">
                        <div class="tg-voice-banner-info">
                            <i class="fa-solid fa-microphone-lines"></i>
                            <span>محادثة صوتية نشطة</span>
                        </div>
                        <button class="tg-voice-banner-btn">انضمام</button>
                    </div>

                    <div class="tg-messages" id="messages-container"></div>

                    <div class="tg-input-area">
                        <button class="tg-input-btn"><i class="fa-solid fa-paperclip"></i></button>
                        <input type="text" id="chatInput" placeholder="رسالة..." autocomplete="off">
                        <button class="tg-send-btn" id="btn-send-toggle" onclick="window.sendChatMessage()">
                            <i class="fa-solid fa-microphone" id="send-icon"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        const chatInput = document.getElementById('chatInput');
        const sendIcon = document.getElementById('send-icon');
        
        chatInput.addEventListener('input', (e) => {
            if (e.target.value.trim().length > 0) {
                sendIcon.className = 'fa-solid fa-paper-plane';
            } else {
                sendIcon.className = 'fa-solid fa-microphone';
            }
        });

        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.sendChatMessage();
        });

        document.getElementById('newChatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const phone = e.target.value.replace(/\D/g, '');
                if (phone.length >= 10) {
                    ChatEngine.createNewPrivateChat(phone);
                    e.target.value = '';
                }
            }
        });

        if(window.innerWidth <= 768) {
            document.getElementById('mobile-back-btn').style.display = 'block';
            document.getElementById('tg-sidebar').classList.add('active-mobile');
        }
    },

    toggleMobileSidebar: () => {
        document.getElementById('tg-sidebar').classList.toggle('active-mobile');
    },

    formatTime: (isoString) => {
        return new Date(isoString).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
    },

    renderContacts: () => {
        const container = document.getElementById('contacts-list');
        if (!container) return;
        
        container.innerHTML = '';
        chatState.contacts.sort((a,b) => new Date(b.time) - new Date(a.time)).forEach(contact => {
            const isActive = contact.id === chatState.activeRoom ? 'active' : '';
            const icon = contact.type === 'group' ? '<i class="fa-solid fa-users"></i>' : contact.name.substring(0, 1).toUpperCase();
            const bg = contact.type === 'group' ? 'linear-gradient(135deg, #34C759, #30D158)' : 'linear-gradient(135deg, #007AFF, #00C6FF)';
            
            const html = `
                <div class="tg-contact-item ${isActive}" onclick="ChatEngine.switchRoom('${contact.id}')">
                    <div class="tg-avatar" style="background: ${bg}">${icon}</div>
                    <div class="tg-contact-info">
                        <div class="tg-contact-name">
                            <span>${contact.name}</span>
                            <span class="tg-contact-time">${ChatUI.formatTime(contact.time)}</span>
                        </div>
                        <div class="tg-contact-lastmsg">${contact.lastMessage}</div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });
    },

    renderMessages: () => {
        const container = document.getElementById('messages-container');
        if (!container) return;

        container.innerHTML = '';
        const messages = chatState.messages[chatState.activeRoom] || [];

        messages.forEach(msg => {
            if (msg.isSystem) {
                container.insertAdjacentHTML('beforeend', `<div class="system-msg">${msg.text}</div>`);
                return;
            }

            const isSelf = msg.sender === chatState.currentUser;
            const wrapClass = isSelf ? 'self' : 'other';
            const tickIcon = msg.status === 'read' ? 'fa-check-double' : 'fa-check';
            const tickColor = msg.status === 'read' ? '#5AC8FA' : 'inherit';
            const ticks = isSelf ? `<i class="fa-solid ${tickIcon}" style="color: ${tickColor}; font-size: 10px;"></i>` : '';
            const senderName = isSelf ? '' : `<span class="tg-msg-sender">${msg.sender}</span>`;

            const html = `
                <div class="tg-msg-wrap ${wrapClass}">
                    <div class="tg-msg-bubble">
                        ${senderName}
                        <span class="tg-msg-text">${msg.text}</span>
                        <div class="tg-msg-meta">
                            <span>${ChatUI.formatTime(msg.time)}</span>
                            ${ticks}
                        </div>
                        <div style="clear: both;"></div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });

        container.scrollTop = container.scrollHeight;
    },

    updateHeader: () => {
        const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
        if (contact) {
            document.getElementById('current-chat-name').innerText = contact.name;
            const avatar = document.getElementById('current-chat-avatar');
            const status = document.getElementById('current-chat-status');
            const voiceBanner = document.getElementById('voice-chat-banner');

            if (contact.type === 'group') {
                avatar.innerHTML = '<i class="fa-solid fa-users"></i>';
                avatar.style.background = 'linear-gradient(135deg, #34C759, #30D158)';
                status.innerText = `${contact.members || '120'} عضو`;
                status.classList.remove('online');
                voiceBanner.classList.add('active'); 
            } else {
                avatar.innerHTML = contact.name.substring(0, 1).toUpperCase();
                avatar.style.background = 'linear-gradient(135deg, #007AFF, #00C6FF)';
                status.innerText = 'متصل الآن';
                status.classList.add('online');
                voiceBanner.classList.remove('active');
            }

            if(window.innerWidth <= 768) {
                document.getElementById('tg-sidebar').classList.remove('active-mobile');
            }
        }
    },
    
    showChatInfo: () => {
        console.log("Show chat profile info");
    }
};

const ChatEngine = {
    connect: () => {
        if (chatState.socket && chatState.socket.readyState === WebSocket.OPEN) return;

        const wsUrl = `${ChatConfig.WS_BASE_URL}${ChatConfig.WS_ENDPOINT}/${chatState.activeRoom}/${chatState.currentUser}`;
        chatState.socket = new WebSocket(wsUrl);

        chatState.socket.onopen = () => {
            chatState.reconnectAttempts = 0;
            const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
            if(contact && contact.type === 'private') {
                document.getElementById('current-chat-status').innerText = 'متصل الآن';
            }
            chatState.socket.send(JSON.stringify({ type: "system", sender: chatState.currentUser, text: "انضم إلى المحادثة" }));
        };

        chatState.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                let messageData;

                if (data.message && typeof data.message === 'string') {
                    try {
                        const innerData = JSON.parse(data.message);
                        messageData = { sender: innerData.sender, text: innerData.text, isSystem: innerData.type === 'system', time: new Date().toISOString(), status: 'read' };
                    } catch (e) {
                        messageData = { sender: data.sender, text: data.message, isSystem: false, time: new Date().toISOString(), status: 'read' };
                    }
                }

                if (messageData) {
                    if (messageData.sender !== chatState.currentUser) {
                        chatState.addMessage(chatState.activeRoom, messageData);
                        const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
                        if (contact) {
                            contact.lastMessage = messageData.isSystem ? messageData.text : `${messageData.sender}: ${messageData.text.substring(0,15)}`;
                            contact.time = messageData.time;
                        }
                        ChatUI.renderMessages();
                        ChatUI.renderContacts();
                    }
                }
            } catch (e) {}
        };

        chatState.socket.onclose = () => {
            document.getElementById('current-chat-status').innerText = 'جارٍ الاتصال...';
            document.getElementById('current-chat-status').classList.remove('online');
            if (chatState.reconnectAttempts < ChatConfig.MAX_RECONNECT_ATTEMPTS) {
                chatState.reconnectAttempts++;
                setTimeout(ChatEngine.connect, ChatConfig.RECONNECT_DELAY);
            }
        };
    },

    switchRoom: (roomId) => {
        if (chatState.activeRoom === roomId) return;
        chatState.activeRoom = roomId;
        if (chatState.socket) chatState.socket.close();
        ChatUI.updateHeader();
        ChatUI.renderContacts();
        ChatUI.renderMessages();
        ChatEngine.connect();
    },

    createNewPrivateChat: (targetPhone) => {
        if (!targetPhone.startsWith("20")) targetPhone = "20" + targetPhone.replace(/^0+/, '');
        if (targetPhone === chatState.currentUser) return;

        const sortedPhones = [chatState.currentUser, targetPhone].sort();
        const privateRoomId = `private_${sortedPhones[0]}_${sortedPhones[1]}`;

        if (!chatState.contacts.find(c => c.id === privateRoomId)) {
            chatState.contacts.push({
                id: privateRoomId,
                name: `+${targetPhone}`,
                type: 'private',
                unread: 0,
                lastMessage: 'ابدأ المحادثة الآن',
                time: new Date().toISOString()
            });
            chatState.saveHistory();
        }
        ChatEngine.switchRoom(privateRoomId);
    }
};

window.sendChatMessage = () => {
    const input = document.getElementById('chatInput');
    const sendIcon = document.getElementById('send-icon');
    const text = input.value.trim();
    
    if (text && chatState.socket && chatState.socket.readyState === WebSocket.OPEN) {
        chatState.socket.send(JSON.stringify({ type: "chat", sender: chatState.currentUser, text: text }));
        const msgObj = { sender: chatState.currentUser, text: text, isSystem: false, time: new Date().toISOString(), status: 'sent' };
        chatState.addMessage(chatState.activeRoom, msgObj);
        
        const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
        if (contact) {
            contact.lastMessage = `أنت: ${text.substring(0,15)}`;
            contact.time = msgObj.time;
        }

        input.value = '';
        sendIcon.className = 'fa-solid fa-microphone';
        
        ChatUI.renderMessages();
        ChatUI.renderContacts();
        
        setTimeout(() => {
            const msgs = chatState.messages[chatState.activeRoom];
            if(msgs && msgs.length > 0) {
                msgs[msgs.length-1].status = 'read';
                ChatUI.renderMessages();
            }
        }, 1000);
    }
};

window.addEventListener('PlatformAuthSuccess', (e) => {
    chatState.currentUser = e.detail.phone;
    ChatUI.injectStyles();
    ChatUI.buildLayout();
    ChatUI.updateHeader();
    ChatUI.renderContacts();
    ChatUI.renderMessages();
    ChatEngine.connect();
});

if (window.CURRENT_USER_PHONE) {
    window.dispatchEvent(new CustomEvent('PlatformAuthSuccess', { detail: { phone: window.CURRENT_USER_PHONE } }));
}
