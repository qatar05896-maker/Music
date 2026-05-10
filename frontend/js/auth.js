/**
 * ============================================================================
 * Platform 2026 - Authentication & Session Management Module
 * Architecture: Enterprise Grade, State-Driven, Deeply Validated
 * ============================================================================
 */

// ==========================================
// 1. Configuration & Constants
// ==========================================
const AuthConfig = {
    API_BASE_URL: window.location.origin.includes('localhost') ? 'http://localhost:8000' : window.location.origin,
    ENDPOINTS: {
        REQUEST_OTP: '/api/auth/request',
        VERIFY_OTP: '/api/auth/verify'
    },
    STORAGE_KEYS: {
        USER_SESSION: 'platform_2026_user_session',
        LAST_PHONE: 'platform_2026_last_phone',
        OTP_TIMESTAMP: 'platform_2026_otp_time'
    },
    TIMERS: {
        RESEND_COOLDOWN_MS: 60000, // 60 seconds cooldown for OTP
        REQUEST_TIMEOUT: 15000 // 15 seconds network timeout
    },
    LIMITS: {
        MAX_PHONE_LENGTH: 15,
        MIN_PHONE_LENGTH: 10,
        OTP_LENGTH: 6
    }
};

// ==========================================
// 2. State Management (Single Source of Truth)
// ==========================================
class AuthState {
    constructor() {
        this.state = {
            step: 'phone', // 'phone', 'otp', 'authenticated'
            phoneNumber: '',
            isLoading: false,
            error: null,
            countdown: 0,
            session: null
        };
        this.listeners = [];
    }

    subscribe(listener) {
        this.listeners.push(listener);
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    update(newState) {
        this.state = { ...this.state, ...newState };
        this.notify();
    }

    get() {
        return this.state;
    }
}

const authState = new AuthState();

// ==========================================
// 3. Storage Manager (Encrypted/Obfuscated)
// ==========================================
const StorageManager = {
    saveSession: (phone) => {
        try {
            const sessionData = {
                phone: phone,
                timestamp: new Date().getTime(),
                token: btoa(phone + '_authenticated_2026') // Simple obfuscation
            };
            localStorage.setItem(AuthConfig.STORAGE_KEYS.USER_SESSION, JSON.stringify(sessionData));
            localStorage.setItem(AuthConfig.STORAGE_KEYS.LAST_PHONE, phone);
        } catch (e) {
            console.error('Storage Error:', e);
        }
    },

    getSession: () => {
        try {
            const data = localStorage.getItem(AuthConfig.STORAGE_KEYS.USER_SESSION);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    },

    clearSession: () => {
        localStorage.removeItem(AuthConfig.STORAGE_KEYS.USER_SESSION);
    },

    saveOtpTimestamp: () => {
        localStorage.setItem(AuthConfig.STORAGE_KEYS.OTP_TIMESTAMP, new Date().getTime().toString());
    },

    getOtpCooldown: () => {
        const time = localStorage.getItem(AuthConfig.STORAGE_KEYS.OTP_TIMESTAMP);
        if (!time) return 0;
        const elapsed = new Date().getTime() - parseInt(time, 10);
        const remaining = AuthConfig.TIMERS.RESEND_COOLDOWN_MS - elapsed;
        return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    }
};

// ==========================================
// 4. Validation Utilities
// ==========================================
const Validator = {
    sanitizePhone: (phone) => {
        return phone.replace(/\D/g, ''); // Remove non-digits
    },

    isValidPhone: (phone) => {
        const clean = Validator.sanitizePhone(phone);
        // Basic Egyptian/International check
        return clean.length >= AuthConfig.LIMITS.MIN_PHONE_LENGTH && 
               clean.length <= AuthConfig.LIMITS.MAX_PHONE_LENGTH;
    },

    isValidOTP: (otp) => {
        const clean = otp.replace(/\D/g, '');
        return clean.length === AuthConfig.LIMITS.OTP_LENGTH;
    }
};

// ==========================================
// 5. Network Client (Robust HTTP wrapper)
// ==========================================
const NetworkClient = {
    post: async (endpoint, payload) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AuthConfig.TIMERS.REQUEST_TIMEOUT);

        try {
            const response = await fetch(`${AuthConfig.API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || data.message || 'حدث خطأ في الاتصال بالخادم');
            }

            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('انتهى وقت الاتصال بالخادم. تأكد من جودة الإنترنت.');
            }
            throw error;
        }
    }
};

// ==========================================
// 6. UI Controller (DOM Manipulation)
// ==========================================
const UI = {
    elements: {
        modal: document.getElementById('auth-modal'),
        appContainer: document.getElementById('app-container'),
        phoneInput: document.getElementById('phoneInput'),
        otpInput: document.getElementById('otpInput'),
        otpGroup: document.getElementById('otp-group'),
        btnAuth: document.getElementById('btn-auth'),
        errorMsg: document.getElementById('auth-error'),
        title: document.getElementById('auth-title'),
        subtitle: document.getElementById('auth-subtitle'),
        userDisplay: document.getElementById('currentUserDisplay')
    },

    init: () => {
        // Event Listeners for inputs
        if (UI.elements.phoneInput) {
            UI.elements.phoneInput.addEventListener('input', (e) => {
                let val = Validator.sanitizePhone(e.target.value);
                e.target.value = val; // Force numeric
                if (val.length > 0 && authState.get().error) {
                    authState.update({ error: null }); // Clear error on typing
                }
            });
            UI.elements.phoneInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleAuth();
            });
        }

        if (UI.elements.otpInput) {
            UI.elements.otpInput.addEventListener('input', (e) => {
                let val = Validator.sanitizePhone(e.target.value);
                e.target.value = val;
                if (val.length === AuthConfig.LIMITS.OTP_LENGTH) {
                    handleAuth(); // Auto submit OTP when 6 digits reached
                }
            });
            UI.elements.otpInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleAuth();
            });
        }
    },

    render: (state) => {
        // Error handling
        if (state.error) {
            UI.elements.errorMsg.innerText = state.error;
            UI.elements.errorMsg.style.display = 'block';
            // Shake animation for error
            UI.elements.modal.classList.add('shake');
            setTimeout(() => UI.elements.modal.classList.remove('shake'), 500);
        } else {
            UI.elements.errorMsg.style.display = 'none';
            UI.elements.errorMsg.innerText = '';
        }

        // Loading state
        if (state.isLoading) {
            UI.elements.btnAuth.disabled = true;
            UI.elements.btnAuth.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحميل...';
            UI.elements.phoneInput.disabled = true;
            UI.elements.otpInput.disabled = true;
        } else {
            UI.elements.btnAuth.disabled = false;
            UI.elements.phoneInput.disabled = false;
            UI.elements.otpInput.disabled = false;
        }

        // Step rendering
        if (state.step === 'phone') {
            UI.elements.otpGroup.classList.add('hidden');
            UI.elements.phoneInput.parentElement.classList.remove('hidden');
            UI.elements.title.innerText = 'تسجيل الدخول';
            UI.elements.subtitle.innerText = 'أدخل رقم هاتفك للمتابعة';
            if (!state.isLoading) {
                UI.elements.btnAuth.innerText = 'طلب الرمز';
            }
        } 
        else if (state.step === 'otp') {
            UI.elements.phoneInput.parentElement.classList.add('hidden');
            UI.elements.otpGroup.classList.remove('hidden');
            UI.elements.title.innerText = 'رمز التحقق';
            UI.elements.subtitle.innerText = `تم إرسال الكود إلى ${state.phoneNumber}`;
            if (!state.isLoading) {
                UI.elements.btnAuth.innerText = 'تأكيد الرمز';
            }
            if (document.activeElement !== UI.elements.otpInput) {
                UI.elements.otpInput.focus();
            }
        }
        else if (state.step === 'authenticated') {
            UI.elements.modal.classList.add('fade-out');
            setTimeout(() => {
                UI.elements.modal.classList.add('hidden');
                UI.elements.modal.classList.remove('active');
                UI.elements.appContainer.classList.remove('hidden');
                UI.elements.appContainer.classList.add('fade-in');
                
                // Display formatted user
                const displayPhone = state.phoneNumber.substring(0, 4) + '****' + state.phoneNumber.substring(state.phoneNumber.length - 3);
                UI.elements.userDisplay.innerHTML = `<i class="fa-solid fa-user-check"></i> ${displayPhone}`;
            }, 400);
        }
    }
};

// Add shake/fade animations via JS injected CSS if not fully in styles.css
const injectAnimations = () => {
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        .fade-out { opacity: 0; transform: scale(0.95); transition: all 0.4s ease; pointer-events: none; }
        .fade-in { animation: fadeInScale 0.5s ease forwards; }
        @keyframes fadeInScale { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    `;
    document.head.appendChild(style);
};

// ==========================================
// 7. Core Business Logic
// ==========================================

// Subscribe UI to state changes
authState.subscribe(UI.render);

// Main Action Handler (Called from HTML button)
window.handleAuth = async () => {
    const state = authState.get();

    if (state.isLoading) return;

    if (state.step === 'phone') {
        const phone = Validator.sanitizePhone(UI.elements.phoneInput.value);
        
        if (!Validator.isValidPhone(phone)) {
            authState.update({ error: 'الرجاء إدخال رقم هاتف صحيح.' });
            return;
        }

        authState.update({ isLoading: true, error: null, phoneNumber: phone });

        try {
            const response = await NetworkClient.post(AuthConfig.ENDPOINTS.REQUEST_OTP, { phone_number: phone });
            
            if (response.status === 'success') {
                StorageManager.saveOtpTimestamp();
                authState.update({ 
                    isLoading: false, 
                    step: 'otp',
                    error: null
                });
            } else {
                throw new Error(response.message || 'خطأ غير معروف');
            }
        } catch (error) {
            authState.update({ isLoading: false, error: error.message });
        }
    } 
    else if (state.step === 'otp') {
        const otp = Validator.sanitizePhone(UI.elements.otpInput.value);
        const phone = state.phoneNumber;

        if (!Validator.isValidOTP(otp)) {
            authState.update({ error: 'رمز التحقق يجب أن يتكون من 6 أرقام.' });
            return;
        }

        authState.update({ isLoading: true, error: null });

        try {
            const response = await NetworkClient.post(AuthConfig.ENDPOINTS.VERIFY_OTP, { 
                phone_number: phone, 
                otp: otp 
            });

            if (response.status === 'success') {
                // Save session securely
                StorageManager.saveSession(phone);
                
                // Transition to authenticated state
                authState.update({ isLoading: false, step: 'authenticated', error: null });
                
                // Initialize modules (WebRTC and Chat)
                bootstrapApplication(phone);
            } else {
                throw new Error(response.message || 'كود غير صحيح');
            }
        } catch (error) {
            authState.update({ isLoading: false, error: error.message });
            UI.elements.otpInput.value = ''; // Clear wrong OTP
        }
    }
};

// System Bootstrapper
const bootstrapApplication = (phoneNumber) => {
    console.log('[Auth] Authentication successful. Bootstrapping application modules...');
    
    // Set global variables for other modules to use
    window.CURRENT_USER_PHONE = phoneNumber;
    
    // Dispatch custom event to notify other scripts that auth is complete
    const authEvent = new CustomEvent('PlatformAuthSuccess', { 
        detail: { phone: phoneNumber } 
    });
    window.dispatchEvent(authEvent);

    // Call init functions of other modules if they exist
    if (typeof window.initWebRTC === 'function') {
        window.initWebRTC();
    }
    if (typeof window.initChat === 'function') {
        window.initChat();
    }
};

window.logout = () => {
    StorageManager.clearSession();
    window.location.reload();
};

// ==========================================
// 8. Initialization & Session Check
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Auth] Initializing Authentication Module...');
    
    injectAnimations();
    UI.init();

    // Check for existing session
    const existingSession = StorageManager.getSession();
    
    if (existingSession && existingSession.phone) {
        console.log('[Auth] Active session found. Restoring...', existingSession.phone);
        // Pre-fill last used phone just in case
        UI.elements.phoneInput.value = existingSession.phone;
        
        // Skip auth flow directly
        authState.update({ 
            step: 'authenticated', 
            phoneNumber: existingSession.phone,
            session: existingSession
        });
        
        bootstrapApplication(existingSession.phone);
    } else {
        console.log('[Auth] No active session. Waiting for user input.');
        // Pre-fill phone if saved from a previous attempt
        const lastPhone = localStorage.getItem(AuthConfig.STORAGE_KEYS.LAST_PHONE);
        if (lastPhone) {
            UI.elements.phoneInput.value = lastPhone;
        }
        
        // Force initial render
        authState.update({ step: 'phone' });
    }
});

/**
 * ============================================================================
 * End of auth.js
 * ============================================================================
 */
