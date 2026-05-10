/*
 * UI Integration Controller (Vanilla JS Version)
 * مدير الواجهة للربط بين القوائم والبروفايل
 */

class UIIntegrationController {
    constructor(options) {
        this.chatContainer = options.chatContainer || document.body;
        this.activeContextMenu = null;
        this.longPressTimer = null;

        this.initEventListeners();
    }

    initEventListeners() {
        // للديسكتوب (كليك يمين)
        this.chatContainer.addEventListener('contextmenu', (e) => this.handleContextMenuTrigger(e));

        // للموبايل (ضغطة مطولة)
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            this.chatContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
            this.chatContainer.addEventListener('touchend', () => this.handleTouchEnd());
            this.chatContainer.addEventListener('touchmove', () => this.handleTouchEnd());
        }

        // الضغط على صورة البروفايل لفتح الشريط الجانبي
        this.chatContainer.addEventListener('click', (e) => this.handleProfileClick(e));
        
        // قفل القوائم عند الضغط في أي مكان فاضي
        document.addEventListener('click', () => this.closeActiveOverlays());
    }

    handleContextMenuTrigger(e) {
        const target = e.target;
        const bubble = target.closest('.bubble'); // تأكد إن كلاس الرسالة عندك اسمه bubble

        if (!bubble) return;

        e.preventDefault(); // منع قائمة المتصفح الافتراضية
        this.closeActiveOverlays();

        try {
            // استدعاء دالة إظهار المنيو اللي ضفناها في ui_core.js
            if (window.ContextMenuController) {
                const messageId = bubble.dataset.mid || 'unknown';
                window.ContextMenuController.show(e, messageId);
                this.activeContextMenu = true;
            }
        } catch (error) {
            console.error('Failed to trigger ContextMenu:', error);
        }
    }

    handleTouchStart(e) {
        this.longPressTimer = setTimeout(() => {
            this.handleContextMenuTrigger(e);
        }, 600); // 600 ملي ثانية للضغطة المطولة
    }

    handleTouchEnd() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    handleProfileClick(e) {
        const target = e.target;
        
        // لو ضغط على اسم أو صورة يفتح البروفايل
        const profileTrigger = target.closest('.avatar-element, .peer-title, .tg-header-info');
        if (!profileTrigger) return;

        e.preventDefault();

        try {
            // استدعاء البروفايل اللي عملناه في ui_core.js
            if (window.ProfileSidebar) {
                // بيانات وهمية للتجربة (المفروض تيجي من الداتابيز بتاعتك)
                const mockContact = {
                    id: profileTrigger.dataset.peerId || '123',
                    name: profileTrigger.textContent.trim() || 'مستخدم جديد',
                    phone: '+20 100 000 0000',
                    bio: 'مرحباً بك في Platform 2026 🚀'
                };
                window.ProfileSidebar.open(mockContact);
            }
        } catch (error) {
            console.error('Failed to open Peer Profile:', error);
        }
    }

    closeActiveOverlays() {
        if (window.ContextMenuController && window.ContextMenuController.menu) {
            window.ContextMenuController.menu.classList.add('hidden');
            this.activeContextMenu = null;
        }
    }
}

// تشغيل الـ Controller أول ما الصفحة تحمل
document.addEventListener('DOMContentLoaded', () => {
    window.uiController = new UIIntegrationController({
        chatContainer: document.getElementById('chat-container') || document.body
    });
});
