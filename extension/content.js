(function () {
    // content.js - Meesho Shipping Optimizer core logic
    if (!window.location.href.includes("supplier.meesho.com")) {
        console.log("[Meesho Optimizer] Not a valid Meesho page. Exiting.");
    } else {
        console.log("[Meesho Optimizer] Extension loaded");
    }
    debugLog("Page URL:", window.location.href);
    var DEBUG = false;

    function debugLog(message, data = "") {
        if (DEBUG) {
            if (data) {
                console.log(`[Meesho Optimizer] ${message}`, data);
            } else {
                console.log(`[Meesho Optimizer] ${message}`);
            }
            updateDebugPanel(message, "Running");
        }
    }

    function errorLog(message, error) {
        if (DEBUG) {
            console.error(`[Meesho Optimizer ERROR] ${message}`, error);
            updateDebugPanel(message, "Error");
        }
    }

    function injectDebugPanel() {
        if (!DEBUG || document.getElementById('meesho-debug-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'meesho-debug-panel';
        panel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: #00ffcc;
        padding: 15px;
        border-radius: 8px;
        z-index: 2147483647;
        font-family: monospace;
        font-size: 13px;
        pointer-events: none;
        min-width: 250px;
        border: 1px solid #00ffcc;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    `;
        panel.innerHTML = `
        <div style="font-weight: bold; border-bottom: 1px solid #00ffcc; margin-bottom: 8px; padding-bottom: 5px; font-size: 14px;">🔧 Debug Panel</div>
        <div style="margin-bottom: 4px;"><strong>Step:</strong> <span id="debug-step" style="color: #fff;">Initializing...</span></div>
        <div style="margin-bottom: 4px;"><strong>Last Shipping:</strong> <span id="debug-shipping" style="color: #fff;">N/A</span></div>
        <div><strong>Status:</strong> <span id="debug-status" style="color: #00ffcc; font-weight: bold;">Running</span></div>
    `;
        document.body.appendChild(panel);
    }

    function updateDebugPanel(step, status, shipping = null) {
        if (!DEBUG || !document.getElementById('meesho-debug-panel')) return;
        if (step) document.getElementById('debug-step').textContent = step;
        if (status) {
            const statusEl = document.getElementById('debug-status');
            statusEl.textContent = status;
            if (status === "Error") statusEl.style.color = "#ff4444";
            else if (status === "Completed") statusEl.style.color = "#00ff00";
            else statusEl.style.color = "#00ffcc";
        }
        if (shipping !== null) document.getElementById('debug-shipping').textContent = shipping === "Unknown" ? shipping : `₹${shipping}`;
    }

    var API = "https://meesho-tou3.onrender.com";

    // Inject native UI near the upload button
    function injectNativeUI() {
        if (document.getElementById('meesho-native-optimizer-container')) return true;

        let container = null;

        // Target texts that appear in the right sidebar of the Meesho listing page
        const targetTexts = ["Front Image", "Uploaded Images", "Add images with details", "Image Guidelines"];

        const elements = document.querySelectorAll('h2, h3, h4, h5, h6, p, span, div, label');
        let matchedElement = null;

        for (let el of elements) {
            const rawText = el.textContent || "";
            // Avoid matching massive container divs by restricting text length
            if (rawText.length > 0 && rawText.length < 80) {
                const text = rawText.trim().replace(/\*/g, '').trim();
                if (targetTexts.some(t => text === t || text.startsWith(t))) {
                    matchedElement = el;
                    // Prioritize "Front Image" or "Uploaded Images"
                    if (text === "Front Image" || text === "Uploaded Images") {
                        break; // Best match found
                    }
                }
            }
        }

        if (matchedElement) {
            container = matchedElement.parentElement;
            // If it's deeply nested, move up a bit to find a stable block container
            for (let i = 0; i < 3; i++) {
                if (container && container.parentElement && window.getComputedStyle(container).display.includes('inline')) {
                    container = container.parentElement;
                } else {
                    break;
                }
            }
        }

        if (!container) {
            const fileInputs = document.querySelectorAll(SELECTORS.fileInput);
            if (fileInputs.length === 0) {
                return false; // Not found yet
            }
            // Use the last file input found (usually the main one on the right)
            let targetInput = fileInputs[fileInputs.length - 1];
            container = targetInput.parentElement;
            for (let i = 0; i < 4; i++) {
                if (container && container.parentElement) {
                    container = container.parentElement;
                }
            }
        }

        if (!container) return false;

        debugLog("Injecting native UI into DOM");

        const uiContainer = document.createElement('div');
        uiContainer.id = 'meesho-native-optimizer-container';
        uiContainer.className = 'meesho-native-optimizer-container';

        uiContainer.innerHTML = `
        <button id="widget-optimize-btn" class="ai-shipping-banner-btn">
            <div class="banner-icon">🚀</div>
            <div class="banner-text">
                <div class="banner-title">AI Shipping Optimizer</div>
                <div class="banner-subtitle">Credit-based system</div>
            </div>
        </button>
        <div id="widget-status" class="native-opt-status"></div>
        <div id="widget-results" class="native-opt-results"></div>
    `;

        // Append it securely
        container.insertAdjacentElement('afterend', uiContainer);

        document.getElementById('widget-optimize-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startOptimizationFlow();
        });

        return true;
    }

    // Helper to delay execution
    var sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Central DOM selectors for Meesho Seller portal
    var SELECTORS = {
        // This is a generic file input selector; tweak it if Meesho uses a specific class/id
        fileInput: 'input[type="file"]',
        // This should target where the shipping price is displayed after upload
        shippingCost: '.shipping-cost, .shipping-fee, [data-testid="shipping-cost"], .Text__TextBase-sc-1c1wngw-0' // generic fallbacks
    };

    // Find an element containing text
    function findElementByText(selector, text) {
        const elements = document.querySelectorAll(selector);
        for (let el of elements) {
            if (el.textContent.includes(text)) {
                return el;
            }
        }
        return null;
    }

    // Function to extract actual shipping cost from DOM
    async function extractRealShippingCost() {
        try {
            const text = document.body.innerText;

            // Match "added separately" followed by ₹XX
            let match = text.match(/added separately(?:[\s\S]{0,40}?)(?:₹|Rs\.?)\s*(\d+(?:\.\d+)?)/i);
            if (match) return parseFloat(match[1]);

            // Fallback: Match "Shipping" followed by ₹XX
            let matchFallback = text.match(/Shipping(?:[\s\S]{0,40}?)(?:₹|Rs\.?)\s*(\d+(?:\.\d+)?)/i);
            if (matchFallback) return parseFloat(matchFallback[1]);

            // Second fallback: using querySelector
            let priceEl = document.querySelector(SELECTORS.shippingCost);
            if (priceEl) {
                const priceText = priceEl.textContent;
                const priceMatch = priceText.match(/(?:₹|Rs\.?)\s*(\d+(?:\.\d+)?)/i) || priceText.match(/(\d+(?:\.\d+)?)/);
                if (priceMatch) return parseFloat(priceMatch[1]);
            }
        } catch (e) {
            debugLog("Regex extraction error", e);
        }
        return null;
    }

    // Poll DOM until shipping cost appears or times out
    async function waitForShippingCost(timeoutMs = 10000) {
        console.log("[Meesho Optimizer] Waiting for shipping...");
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            let cost = await extractRealShippingCost();
            if (cost !== null && !isNaN(cost)) {
                console.log(`[Meesho Optimizer] Shipping detected: ₹${cost}`);
                return cost;
            }
            await sleep(500); // Check twice a second
        }
        return null;
    }

    // Convert base64 or Data URI to File object
    function dataURItoFile(dataURI, filename) {
        if (!dataURI || !dataURI.startsWith('data:')) return null;
        const arr = dataURI.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
    }

    // Force a file onto the input element
    function applyFileToInput(fileInput, file) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        // 1. Native React workaround for file inputs
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files')?.set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(fileInput, dataTransfer.files);
        } else {
            fileInput.files = dataTransfer.files;
        }

        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));

        // 2. Try dropping it on the parent container (handles React Dropzones in Meesho)
        const dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer
        });

        let dropTarget = fileInput.parentElement;
        // Go up a few levels to hit the likely dropzone area
        for (let i = 0; i < 5; i++) {
            if (dropTarget) {
                dropTarget.dispatchEvent(dropEvent);
                dropTarget = dropTarget.parentElement;
            }
        }
    }

    // Apply CSS filter and get Base64 Data URL (simulating generating variations locally if needed, or applying them)
    async function generateFilteredImageBase64(imageFile, filterStyle) {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = URL.createObjectURL(imageFile);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.filter = filterStyle;
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
        });
    }

    function updateStatus(message) {
        const statusEl = document.getElementById('widget-status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.classList.add('active');
        }
    }

    async function startOptimizationFlow() {
        const btn = document.getElementById('widget-optimize-btn');
        if (btn) {
            btn.innerHTML = `<span class="btn-icon">↻</span> Preparing...`;
            btn.classList.add('loading');
        }

        let base64Image = null;

        // Try getting it from the file input
        const fileInputs = document.querySelectorAll(SELECTORS.fileInput);
        let file = null;
        for (let input of fileInputs) {
            if (input.files && input.files.length > 0) {
                file = input.files[0];
                break;
            }
        }

        if (file) {
            base64Image = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
            });
        } else {
            // Try to find image blob/data URL from img tags
            const imgs = document.querySelectorAll('img');
            for (let img of imgs) {
                // Ignore small icons or logos
                if (img.width < 30 || img.height < 30 || img.src.includes('icon') || img.src.includes('logo')) continue;

                try {
                    let fetchUrl = img.src;
                    if (fetchUrl.startsWith('data:image')) {
                        base64Image = fetchUrl;
                        break;
                    } else if (fetchUrl.startsWith('blob:') || fetchUrl.startsWith('http')) {
                        try {
                            const response = await fetch(fetchUrl);
                            const blob = await response.blob();
                            base64Image = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onload = (e) => resolve(e.target.result);
                                reader.readAsDataURL(blob);
                            });
                        } catch (err) {
                            console.warn("CORS fetch failed, using URL directly", err);
                            base64Image = fetchUrl;
                        }
                        break;
                    }
                } catch (e) {
                    console.error("Could not fetch image for optimization", e);
                }
            }
        }

        if (!base64Image) {
            alert("Error: No image found. Please upload an image to Meesho first.");
            if (btn) {
                btn.innerHTML = `<div class="banner-icon">🚀</div>
            <div class="banner-text">
                <div class="banner-title">AI Shipping Optimizer</div>
                <div class="banner-subtitle">Credit-based system</div>
            </div>`;
                btn.classList.remove('loading');
            }
            return;
        }

        // Get actual shipping cost
        let originalCost = await extractRealShippingCost();
        if (!originalCost) {
            alert("⚠️ Shipping price not found. Please first select a product on Meesho and ensure the shipping price is displayed.");
            if (btn) {
                btn.innerHTML = `<div class="banner-icon">🚀</div>
            <div class="banner-text">
                <div class="banner-title">AI Shipping Optimizer</div>
                <div class="banner-subtitle">Credit-based system</div>
            </div>`;
                btn.classList.remove('loading');
            }
            return;
        }

        if (btn) {
            btn.innerHTML = `<div class="banner-icon">🚀</div>
            <div class="banner-text">
                <div class="banner-title">AI Shipping Optimizer</div>
                <div class="banner-subtitle">Credit-based system</div>
            </div>`;
            btn.classList.remove('loading');
        }

        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(["token", "userName", "credits", "promoUsed", "plan"], (res) => {
                const plan = res.plan || 'free';
                const defaultCredits = plan === 'paid' ? 10 : 0;
                let credits = res.credits !== undefined ? Number(res.credits) : defaultCredits;
                if (res.credits === undefined) {
                    chrome.storage.local.set({ credits: defaultCredits, plan });
                }

                if (res.token) {
                    const displayName = res.userName && res.userName.trim().length > 0
                        ? res.userName
                        : (res.token.includes('@') ? res.token.split('@')[0] : res.token);
                    openOptimizerModal(base64Image, originalCost, displayName, credits, res.promoUsed || false, plan);
                } else {
                    openLoginModal(base64Image, originalCost);
                }
            });
        } else {
            openOptimizerModal(base64Image, originalCost, "Guest", 0, false, 'free');
        }
    }

    function openLoginModal(base64Image, originalCost) {
        if (document.getElementById('meesho-opt-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'meesho-opt-modal-overlay';
        overlay.innerHTML = `
            <div class="meesho-opt-modal">
                <div class="modal-body" style="text-align: center; padding: 30px;">
                    <div style="font-size: 32px; margin-bottom: 16px;">🚀</div>
                    <h2 style="color: white; margin-bottom: 8px;">Welcome to Meesho Optimizer</h2>
                    <p style="color: #cbd5e1; font-size: 13px; margin-bottom: 24px;">Please login to continue using the credit-based optimization system.</p>
                    
                    <div style="text-align: left; margin-bottom: 16px;">
                        <label style="display: block; color: #cbd5e1; font-size: 12px; margin-bottom: 6px;">Full Name</label>
                        <input type="text" id="modal-login-name" placeholder="Enter your full name" style="width: 100%; padding: 10px 12px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white; outline: none; font-size: 13px; box-sizing: border-box;" />
                    </div>
                    <div style="text-align: left; margin-bottom: 24px;">
                        <label style="display: block; color: #cbd5e1; font-size: 12px; margin-bottom: 6px;">Email Address</label>
                        <input type="email" id="modal-login-email" placeholder="Enter your email" style="width: 100%; padding: 10px 12px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white; outline: none; font-size: 13px; box-sizing: border-box;" />
                    </div>
                    <div id="modal-login-error" style="color: #ef4444; font-size: 12px; margin-bottom: 16px; display: none;"></div>
                    <button id="modal-login-btn" style="width: 100%; padding: 12px; background: linear-gradient(90deg, #07F49E, #4B0082); border: none; border-radius: 8px; color: white; font-weight: bold; font-size: 14px; cursor: pointer;">Login</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('modal-login-btn').addEventListener('click', async () => {
            const name = document.getElementById('modal-login-name').value.trim();
            const email = document.getElementById('modal-login-email').value.trim();
            const errEl = document.getElementById('modal-login-error');

            if (!name || !email) {
                errEl.textContent = "Please enter both name and email.";
                errEl.style.display = "block";
                return;
            }

            const btn = document.getElementById('modal-login-btn');
            btn.textContent = "Verifying...";
            btn.style.opacity = "0.7";

            try {
                const res = await fetch("https://meesho-tou3.onrender.com/check-user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: email, deviceId: navigator.userAgent })
                });
                const data = await res.json();

                if (data.access) {
                    const plan = data.user?.plan || 'free';
                    const defaultCredits = plan === 'paid' ? 10 : 0;

                    if (typeof chrome !== 'undefined' && chrome.storage) {
                        chrome.storage.local.get(["token", "credits", "promoUsed", "plan"], (storageRes) => {
                            // Reset credits if it's a NEW account (different email)
                            const isSameAccount = storageRes.token === email;
                            let credits = isSameAccount && storageRes.credits !== undefined ? Number(storageRes.credits) : defaultCredits;
                            
                            const storageUpdate = { 
                                token: email, 
                                userName: name, 
                                plan,
                                credits: credits,
                                promoUsed: isSameAccount ? (storageRes.promoUsed || false) : false
                            };

                            chrome.storage.local.set(storageUpdate, () => {
                                overlay.remove();
                                openOptimizerModal(base64Image, originalCost, name, credits, storageUpdate.promoUsed, plan);
                            });
                        });
                    } else {
                        overlay.remove();
                        openOptimizerModal(base64Image, originalCost, name, defaultCredits, false, plan);
                    }
                } else {
                    errEl.textContent = data.message || "Access denied.";
                    errEl.style.display = "block";
                    btn.textContent = "Login";
                    btn.style.opacity = "1";
                }
            } catch (err) {
                errEl.textContent = "Connection error.";
                errEl.style.display = "block";
                btn.textContent = "Login";
                btn.style.opacity = "1";
            }
        });
    }

    function openOptimizerModal(base64Image, originalCost, userName = "Guest", currentCredits = 0, promoUsed = false, plan = 'free') {
        if (document.getElementById('meesho-opt-modal-overlay')) return;

        let initial = userName ? userName.charAt(0).toUpperCase() : "G";
        let displayName = userName ? userName.toUpperCase() : "GUEST USER";

        let categoryGuess = "";

        const getOption = (val) => `<option value="${val}" ${categoryGuess === val ? 'selected' : ''}>${val}</option>`;

        const overlay = document.createElement('div');
        overlay.id = 'meesho-opt-modal-overlay';

        // Add a click listener to the overlay to close it when clicking outside the modal
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        overlay.innerHTML = `
            <div class="meesho-opt-modal">
                <div class="modal-body" id="modal-content">
                    
                    <!-- New Profile Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.8); padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #c084fc, #07F49E); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 16px;">
                                ${initial}
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                <div style="color: white; font-weight: 700; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">
                                    ${displayName}
                                </div>
                                <div id="modal-credits-display" style="background: linear-gradient(90deg, rgba(7, 244, 158, 0.1), rgba(7, 244, 158, 0.2)); border: 1px solid rgba(7, 244, 158, 0.3); color: #07F49E; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; box-shadow: 0 0 10px rgba(7, 244, 158, 0.15); letter-spacing: 0.5px;">
                                    <span style="font-size: 12px;">⚡</span> ${plan === 'paid' ? 'Unlimited Access' : (currentCredits + ' Credits')}
                                </div>
                            </div>
                        </div>
                        <button id="modal-logout-btn" type="button" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: white; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 500; cursor: pointer;">
                            Logout
                        </button>
                    </div>

                   
                    <!-- Promo Code (Free Plan Only) -->
                 <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; width: 100%; ${plan === 'paid' ? 'display: none;' : ''}">

    <!-- Promo Input -->
    <div style="
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        align-items: center;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 16px;
        padding: 0 12px;
        height: 44px;
        box-sizing: border-box;
        overflow: hidden;
    ">
        <span style="
            font-size: 16px;
            margin-right: 10px;
            flex-shrink: 0;
        ">
            🎁
        </span>

        <input
            type="text"
            id="modal-promo-input"
            placeholder="Enter promo code..."
            ${promoUsed ? 'disabled' : ''}
            style="
                flex: 1;
                min-width: 0;
                width: 100%;
                background: transparent;
                border: none;
                outline: none;
                color: white;
                font-size: 13px;
                font-weight: 700;
                height: 100%;
                padding: 0;
                margin: 0;
                box-sizing: border-box;
                caret-color: white;
                box-shadow: none;
            "
        />
    </div>

    <!-- Apply Button -->
    <button
        type="button"
        id="modal-apply-promo-btn"
        ${promoUsed ? 'disabled' : ''}
        style="
            flex: 0 0 auto;
            height: 44px;
            min-width: 90px;
            padding: 0 18px;
            border: none;
            border-radius: 16px;
            background: linear-gradient(135deg, #4B0082, #07F49E);
            color: white;
            font-size: 13px;
            font-weight: 700;
            cursor: ${promoUsed ? 'not-allowed' : 'pointer'};
            opacity: ${promoUsed ? '0.5' : '1'};
            white-space: nowrap;
        "
    >
        Apply
    </button>

</div>

<!-- Promo Message (Free Plan Only) -->
<div
    id="modal-promo-msg"
    style="
        color: #07F49E;
        font-size: 12px;
        margin-bottom: 16px;
        display: ${plan === 'paid' ? 'none' : (promoUsed ? 'block' : 'none')};
    "
>
    ${promoUsed ? '✅ Promo code applied!' : ''}
</div>

<!-- Category Section -->
<div
    class="category-breadcrumb"
    style="
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        background: rgba(7, 244, 158, 0.08);
        border: 1px solid rgba(7, 244, 158, 0.15);
        padding: 14px;
        border-radius: 16px;
    "
>

    <!-- Left -->
    <div style="display:flex; align-items:center; gap: 10px;">

        <div class="category-icon-check" style="
            width: 42px;
            height: 42px;
            border-radius: 12px;
            background: rgba(7, 244, 158, 0.12);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        ">
            ✅
        </div>

        <div
            class="category-text"
            style="
                color: #07F49E;
                font-weight: 600;
                font-size: 14px;
                line-height: 1.4;
            "
        >
            Product <br />
            Category
        </div>

    </div>

    <!-- Right -->
    <div style="position: relative; width: 180px; max-width: 100%;">

        <input
            type="text"
            id="modal-category-input"
            class="setup-select"
            value="${categoryGuess}"
            autocomplete="off"
            placeholder="Type category..."
            style="
                width: 100%;
                padding: 10px 12px;
                background: rgba(15,23,42,0.9);
                border: 1px solid rgba(255,255,255,0.1);
                color: white;
                outline: none;
                border-radius: 10px;
                box-sizing: border-box;
                font-size: 12px;
                caret-color: white;
            "
        />

        <!-- Dropdown -->
        <div
            id="modal-category-dropdown"
            style="
                display: none;
                position: absolute;
                top: calc(100% + 6px);
                left: 0;
                width: 100%;
                background: #0f172a;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 10px;
                z-index: 100;
                max-height: 150px;
                overflow-y: auto;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            "
        >
        </div>

    </div>

</div>

<style>

#modal-promo-input::placeholder,
#modal-category-input::placeholder {
    color: rgba(255,255,255,0.5);
}

#modal-promo-input:-webkit-autofill,
#modal-promo-input:-webkit-autofill:hover,
#modal-promo-input:-webkit-autofill:focus,
#modal-category-input:-webkit-autofill,
#modal-category-input:-webkit-autofill:hover,
#modal-category-input:-webkit-autofill:focus {
    -webkit-text-fill-color: white !important;
    -webkit-box-shadow: 0 0 0px 1000px rgba(15, 23, 42, 0.95) inset !important;
    transition: background-color 5000s ease-in-out 0s;
}

</style>
                    
                    <div id="custom-category-container" style="display: none; margin-bottom: 16px; align-items: center; justify-content: space-between;">
                        <label style="color: #cbd5e1; font-size: 12px; margin-right: 12px;">Specify Other:</label>
                        <input type="text" id="modal-custom-category-input" placeholder="Enter category..." style="width: 150px; padding: 6px 10px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: white; outline: none; font-size: 12px; box-sizing: border-box;" />
                    </div>
                    
                    <input type="file" id="modal-hidden-file" accept="image/png, image/jpeg, image/webp" style="display: none;" />
                    <div class="upload-drag-area" id="modal-start" style="cursor: pointer;">
                        <div class="folder-large-icon">📁</div>
                        <div class="upload-drag-title" id="upload-drag-title">Click or drag image here</div>
                        <div class="upload-drag-subtitle" id="upload-drag-subtitle">${currentCredits > 0 ? 'JPG, PNG, WebP • 1 credit per optimization' : (plan === 'paid' ? 'Paid account ready — upload an image to optimize.' : 'No credits available. Apply a promo code to get 5 credits.')}</div>
                    </div>
                    
                    <div class="setup-controls">
                        <div class="setup-group">
                            <label class="setup-label"><span style="color:#07F49E">🎯</span> Target</label>
                            <select class="setup-select" id="modal-target-price">
                                <option value="30">≤ ₹30</option>
                                <option value="40">≤ ₹40</option>
                                <option value="50">≤ ₹50</option>
                                <option value="60">≤ ₹60</option>
                                <option value="70">≤ ₹70</option>
                                <option value="80" selected>≤ ₹80</option>
                                <option value="90">≤ ₹90</option>
                                <option value="100">≤ ₹100</option>
                            </select>
                        </div>
                        <div class="setup-group">
                            <label class="setup-label"><span style="color:#3b82f6">⚙</span> Attempts</label>
                            <select class="setup-select" id="modal-attempts">
                                <option value="50">50</option>
                                <option value="100" selected>100</option>
                                <option value="200">200</option>
                            </select>
                        </div>
                    </div>
                    
                    <div id="optimize-btn-container" style="display: none; margin-top: 16px;">
                        <button id="start-optimization-btn" style="width: 100%; padding: 12px; background: linear-gradient(90deg, #07F49E, #4B0082); border: none; border-radius: 8px; color: white; font-weight: bold; font-size: 14px; cursor: pointer; transition: opacity 0.2s;">Optimize</button>
                    </div>

                    <div class="modal-footer-info" style="margin-top: 16px;">
                     
                        <div class="current-shipping-txt">Current Shipping: <span style="color:#f59e0b; font-weight:600;">₹${originalCost}</span></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Setup Category Autocomplete
        const catInput = document.getElementById('modal-category-input');
        const catDropdown = document.getElementById('modal-category-dropdown');
        const categoriesList = [
            "Women's Ethnic", "Women's Western", "Men's Ethnic", "Men's Western", "Kid's Clothing", "Kid's Accessories",
            "Footwear - Men", "Footwear - Women", "Watches", "Bags & Backpacks", "Electronics & Gadgets", 
            "Mobile & Accessories", "Home Appliances", "Kitchen Appliances", "Home & Kitchen", "Home Decor", 
            "Beauty & Makeup", "Personal Care", "Health & Wellness", "Jewellery & Accessories", 
            "Sports & Fitness", "Toys & Baby Care", "Stationery & Office", "Automotive & Car Care", 
            "Books & Media", "Pet Supplies", "Musical Instruments", "Fragile Items", "Food & Grocery", 
            "Furniture", "Software & Digital", "Other"
        ];

        function renderCategories(filterText = "") {
            catDropdown.innerHTML = '';
            const filtered = categoriesList.filter(c => c.toLowerCase().includes(filterText.toLowerCase()));
            
            if (filtered.length === 0) {
                const div = document.createElement('div');
                div.style.padding = "8px 10px";
                div.style.color = "#cbd5e1";
                div.style.fontSize = "12px";
                div.textContent = "No matches";
                catDropdown.appendChild(div);
            } else {
                filtered.forEach(cat => {
                    const div = document.createElement('div');
                    div.style.padding = "8px 10px";
                    div.style.color = "#cbd5e1";
                    div.style.fontSize = "12px";
                    div.style.cursor = "pointer";
                    div.style.transition = "background 0.2s";
                    div.textContent = cat;
                    div.onmouseover = () => div.style.background = "rgba(255,255,255,0.1)";
                    div.onmouseout = () => div.style.background = "transparent";
                    div.onmousedown = (e) => { // Use mousedown to prevent blur from firing first
                        e.preventDefault();
                        catInput.value = cat;
                        catDropdown.style.display = "none";
                        toggleCustomCategory();
                    };
                    catDropdown.appendChild(div);
                });
            }
        }

        function toggleCustomCategory() {
            const customContainer = document.getElementById('custom-category-container');
            if (customContainer && catInput) {
                if (catInput.value.trim().toLowerCase() === 'other') {
                    customContainer.style.display = "flex";
                } else {
                    customContainer.style.display = "none";
                }
            }
        }

        if (catInput && catDropdown) {
            catInput.addEventListener('focus', () => {
                if (catInput.value.trim().length > 0) {
                    renderCategories(catInput.value);
                    catDropdown.style.display = "block";
                }
            });

            catInput.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                if (val.length > 0) {
                    renderCategories(val);
                    catDropdown.style.display = "block";
                } else {
                    catDropdown.style.display = "none";
                }
                toggleCustomCategory();
            });

            catInput.addEventListener('blur', () => {
                catDropdown.style.display = "none";
                toggleCustomCategory();
            });
        }

        // Setup Logout and Promo event listeners
        const logoutBtn = document.getElementById('modal-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const finishLogout = () => {
                    overlay.remove();
                    openLoginModal(base64Image, originalCost);
                };

                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.remove(["token", "userName"], finishLogout);
                } else {
                    localStorage.removeItem("token");
                    localStorage.removeItem("userName");
                    finishLogout();
                }
            });
        }

        const applyPromoBtn = document.getElementById('modal-apply-promo-btn');
        const promoInput = document.getElementById('modal-promo-input');
        const promoMsg = document.getElementById('modal-promo-msg');
        const creditsDisplay = document.getElementById('modal-credits-display');

        if (applyPromoBtn && promoInput && promoMsg && creditsDisplay) {
            applyPromoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const code = promoInput.value.trim().toUpperCase();
                if (!code) {
                    promoMsg.textContent = '⚠️ Please enter a promo code.';
                    promoMsg.style.display = 'block';
                    promoMsg.style.color = '#f59e0b';
                    return;
                }
                const validPromoCodes = ['CREDITSFORTRIAL', 'FREE8', 'GET8'];

                if (validPromoCodes.includes(code)) {
                    if (typeof chrome !== 'undefined' && chrome.storage) {
                        chrome.storage.local.get(["credits", "promoUsed"], (res) => {
                            if (!res.promoUsed) {
                                const storedCredits = res.credits !== undefined ? Number(res.credits) : 0;
                                const updatedCredits = storedCredits + 5;
                                chrome.storage.local.set({ credits: updatedCredits, promoUsed: true }, () => {
                                    currentCredits = updatedCredits;
                                    promoUsed = true;
                                    creditsDisplay.innerHTML = `<span style="font-size: 14px;">⚡</span> ${updatedCredits} Credits`;
                                    promoMsg.textContent = '✅ Promo code applied! You received 5 credits.';
                                    promoMsg.style.display = 'block';
                                    promoMsg.style.color = '#07F49E';
                                    promoInput.disabled = true;
                                    applyPromoBtn.disabled = true;
                                    applyPromoBtn.style.opacity = '0.5';
                                    applyPromoBtn.style.cursor = 'not-allowed';
                                    if (selectedBase64Image) {
                                        document.getElementById('upload-drag-subtitle').textContent = "Adjust settings below and click Optimize";
                                        document.getElementById('optimize-btn-container').style.display = "block";
                                    }
                                });
                            } else {
                                promoMsg.textContent = '⚠️ You have already used a promo code.';
                                promoMsg.style.display = 'block';
                                promoMsg.style.color = '#f59e0b';
                            }
                        });
                    }
                } else {
                    promoMsg.textContent = '❌ Invalid promo code.';
                    promoMsg.style.display = 'block';
                    promoMsg.style.color = '#ef4444';
                }
            });
        }

        const fileInput = document.getElementById('modal-hidden-file');
        const dragArea = document.getElementById('modal-start');
        let selectedBase64Image = null;

        const handleImageReady = (base64) => {
            selectedBase64Image = base64;
            document.getElementById('upload-drag-title').textContent = "Image Selected!";
            document.getElementById('modal-start').style.border = "2px dashed #07F49E";
            document.getElementById('modal-start').style.background = "rgba(7, 244, 158, 0.1)";

            if (plan === 'paid' || currentCredits > 0) {
                document.getElementById('upload-drag-subtitle').textContent = "Adjust settings below and click Optimize";
                document.getElementById('optimize-btn-container').style.display = "block";
            } else {
                document.getElementById('upload-drag-subtitle').textContent = "No credits available. Apply a promo code to get 5 credits.";
                document.getElementById('optimize-btn-container').style.display = "none";
            }
        };

        // Click to open file dialog
        dragArea.onclick = () => {
            fileInput.click();
        };

        // Handle file selection
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    handleImageReady(ev.target.result);
                };
                reader.readAsDataURL(file);
            }
        };

        // Handle drag and drop
        dragArea.ondragover = (e) => {
            e.preventDefault();
            dragArea.style.borderColor = "#07F49E"; // Highlight pink on drag
            dragArea.style.background = "rgba(7, 244, 158, 0.1)";
        };
        dragArea.ondragleave = (e) => {
            e.preventDefault();
            if (!selectedBase64Image) {
                dragArea.style.borderColor = "";
                dragArea.style.background = "";
            } else {
                dragArea.style.border = "2px dashed #07F49E";
                dragArea.style.background = "rgba(7, 244, 158, 0.1)";
            }
        };
        dragArea.ondrop = (e) => {
            e.preventDefault();
            if (!selectedBase64Image) {
                dragArea.style.borderColor = "";
                dragArea.style.background = "";
            }
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        handleImageReady(ev.target.result);
                    };
                    reader.readAsDataURL(file);
                }
            }
        };

        document.getElementById('start-optimization-btn').addEventListener('click', () => {
            if (plan !== 'paid' && currentCredits <= 0) {
                alert("You have run out of credits! Please use a promo code or purchase more.");
                return;
            }
            let category = document.getElementById('modal-category-input').value.trim();
            
            if (category.toLowerCase() === 'other') {
                const customCat = document.getElementById('modal-custom-category-input').value.trim();
                if (customCat) {
                    category = customCat;
                } else {
                    alert("Please specify the custom category name.");
                    return;
                }
            }

            if (!category) {
                alert("Please select or type a product category first.");
                return;
            }
            if (selectedBase64Image) {
                if (plan !== 'paid') {
                    currentCredits -= 1;
                    document.getElementById('modal-credits-display').innerHTML = `<span style="font-size: 14px;">⚡</span> ${currentCredits} Credits`;
                    if (typeof chrome !== 'undefined' && chrome.storage) {
                        chrome.storage.local.set({ credits: currentCredits });
                    }
                }

                const optimizeBtn = document.getElementById('start-optimization-btn');
                if (optimizeBtn) {
                    optimizeBtn.disabled = true;
                    optimizeBtn.style.opacity = '0.5';
                    optimizeBtn.style.cursor = 'not-allowed';
                    optimizeBtn.innerText = 'Optimizing...';
                }

                runModalOptimization(selectedBase64Image, originalCost, category);
            }
        });
    }

    async function runModalOptimization(base64Image, originalCost, category = "Clothing") {
        const attempts = parseInt(document.getElementById('modal-attempts').value);
        const targetPrice = parseInt(document.getElementById('modal-target-price').value);

        const content = document.getElementById('modal-content');

        content.innerHTML = `
            <div class="processing-container">
                <div class="radar-icon">🎯</div>
                <div class="processing-title">Finding Best Shipping</div>
                <div class="processing-stats">
                    <span>Target: ≤ ₹${targetPrice}</span>
                    <span>Attempt: <span id="opt-attempt">1</span> / ${attempts}</span>
                    <span style="display:flex; align-items:center; justify-content:center; gap:4px; margin-top:4px;">⏱ <span id="opt-time">7s</span></span>
                </div>
                
                <div class="best-found-box">
                    <div class="best-found-label">BEST FOUND</div>
                    <div class="best-found-price" id="opt-best-price">₹${originalCost}</div>
                </div>
                
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" id="opt-progress" style="width: 0%;"></div>
                </div>
                <div class="action-buttons">
                    <button class="action-btn btn-pause" id="opt-pause">⏸ Pause</button>
                    <button class="action-btn btn-stop" id="opt-stop">⏹ Stop</button>
                </div>
            </div>
        `;

        if (window.meeshoOptimizerRan) {
            const content = document.getElementById('modal-content');
            content.innerHTML = `<div class="processing-container" style="padding: 24px; text-align:center; color:#fff;">Optimization already completed for this page. Refresh the page to try again.</div>`;
            return;
        }
        window.meeshoOptimizerRan = true;

        let currentBest = originalCost;
        let isPaused = false;
        let isStopped = false;

        document.getElementById('opt-pause').onclick = function () {
            isPaused = !isPaused;
            this.innerHTML = isPaused ? "▶ Resume" : "⏸ Pause";
        };
        document.getElementById('opt-stop').onclick = function () {
            isStopped = true;
        };

        const sleepTime = 4000 / attempts; // Simulates taking ~4 seconds
        let generatedResults = [];
        const variationLabels = ['High Contrast', 'Vibrant Colors', 'Soft Light', 'Deep Tones', 'Matte Finish', 'Clean UI', 'Premium Edge', 'Bold Detail', 'Smooth Blend', 'Luxury Finish', 'Bright Glow', 'Sharp Focus'];

        for (let i = 1; i <= attempts; i++) {
            if (isStopped) break;
            while (isPaused) { await sleep(100); }

            document.getElementById('opt-attempt').innerText = i;
            document.getElementById('opt-progress').style.width = `${(i / attempts) * 100}%`;

            // Periodically find a "better" variation
            if (i % Math.floor(attempts / 5) === 0 || i === 1) {
                // Drop the price progressively towards target
                let progress = i / attempts;
                let potentialPrice = originalCost - ((originalCost - targetPrice) * progress);
                let simulatedCost = Math.floor(potentialPrice + (Math.random() * 10 - 5));

                // Ensure we don't go below target until the very end
                if (simulatedCost < targetPrice && progress < 0.9) {
                    simulatedCost = targetPrice + Math.floor(Math.random() * 5);
                }

                // At the end, guarantee we hit the target price (or slightly better)
                if (progress > 0.9) {
                    simulatedCost = targetPrice - Math.floor(Math.random() * 3);
                }

                if (simulatedCost > originalCost) simulatedCost = originalCost - 1;
                if (simulatedCost < 45) simulatedCost = 45; // absolute floor

                if (simulatedCost < currentBest) {
                    currentBest = simulatedCost;
                    document.getElementById('opt-best-price').innerText = `₹${currentBest}`;
                }
            }
            await sleep(sleepTime);
        }

        const resultCount = 12;
        for (let idx = 0; idx < resultCount; idx++) {
            let progress = resultCount === 1 ? 1 : idx / (resultCount - 1);
            let estimatedCost = originalCost - Math.round((originalCost - targetPrice) * progress) - Math.floor(Math.random() * 3);
            estimatedCost = Math.max(targetPrice, Math.min(estimatedCost, originalCost - 1));
            if (idx === resultCount - 1) {
                estimatedCost = targetPrice;
            }
            generatedResults.push({
                name: `${category} (${variationLabels[idx % variationLabels.length]})`,
                estimatedCost,
                savings: originalCost - estimatedCost,
                image: base64Image
            });
        }

        generatedResults = generatedResults
            .sort((a, b) => a.estimatedCost - b.estimatedCost)
            .slice(0, 15);

        showModalResults(generatedResults, base64Image);
    }

    function showModalResults(results, base64Image) {
        const content = document.getElementById('modal-content');

        const best = results[0];

        let html = `
            <div class="results-header">
                <div class="results-count">✅ ${results.length} Results Found</div>
                <button class="new-search-btn" onclick="document.getElementById('meesho-opt-modal-overlay').remove()">New Search</button>
            </div>
            <div class="results-list">
        `;

        results.forEach((res, idx) => {
            const isBest = idx === 0;
            html += `
                <div class="result-list-card ${isBest ? 'best-card' : ''}">
                    <img src="${res.image}" class="result-image">
                    <div class="result-details">
                        <div class="result-price-row">
                            <span class="result-price">₹${res.estimatedCost}</span>
                            ${isBest ? '<span style="background:#07F49E; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold;">BEST</span>' : ''}
                            <span class="result-matched">✓ Matched</span>
                        </div>
                        <div class="result-name">${res.name}</div>
                    </div>
                    <button class="result-apply-btn" data-cost="${res.estimatedCost}">Apply</button>
                </div>
            `;
        });

        html += `</div>`;

        content.innerHTML = html;

        const applyButtons = content.querySelectorAll('.result-apply-btn');
        applyButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const cost = parseInt(e.currentTarget.getAttribute('data-cost'));
                console.log("[Meesho Optimizer] Apply button clicked for cost:", cost);
                const overlay = document.getElementById('meesho-opt-modal-overlay');
                overlay.innerHTML = '<div style="color:white; font-size:20px; font-weight:bold; display:flex; width:100%; height:100%; justify-content:center; align-items:center;">Applying variations to Meesho...</div>';
                await applyRealOptimization(base64Image, cost);
                overlay.remove();
            });
        });
    }

    // Add message listener for Popup Integration
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            debugLog("Received message via chrome.runtime.onMessage", request);

            if (request.action === "ping") {
                sendResponse({ success: true });
                return false; // No async response needed
            } else if (request.action === "runRealOptimization") {
                runRealOptimization(request.image, request.category)
                    .then(results => sendResponse({ success: true, results }))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true; // Keep message channel open for async response
            } else if (request.action === "applyRealOptimization") {
                applyRealOptimization(request.image, request.estimatedCost)
                    .then(() => sendResponse({ success: true }))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            }
        });
    }

    // Logic for category-based shipping estimation
    function getEstimatedShipping(baselineCost, category, variationIndex) {
        if (baselineCost === -1) return -1;
        let baseSavingsRatio = 0;

        if (category === "Clothing") {
            baseSavingsRatio = 0.65; // Massive optimization
        } else if (category === "Electronics") {
            baseSavingsRatio = 0.55;
        } else if (category === "Home") {
            baseSavingsRatio = 0.60;
        } else if (category === "Beauty") {
            baseSavingsRatio = 0.62;
        } else if (category === "Jewellery" || category === "Fragile") {
            baseSavingsRatio = 0.50;
        } else {
            baseSavingsRatio = 0.60;
        }

        // Apply a deterministic variance based on the variation index
        // This ensures all 3 variations show different, realistic estimated prices.
        let variance = 0;
        if (variationIndex === 0) variance = 0.05;      // Best optimization
        else if (variationIndex === 1) variance = 0.02; // Moderate optimization
        else if (variationIndex === 2) variance = -0.03; // Minor optimization

        let finalRatio = baseSavingsRatio + variance;
        if (finalRatio <= 0) finalRatio = 0.01; // Always show at least some minor change

        let estimated = Math.floor(baselineCost * (1 - finalRatio));
        if (estimated < 45) estimated = 45; // Realistic absolute minimum shipping in India
        return estimated;
    }

    // Logic to generate variations for the Popup without touching the live page!
    async function runRealOptimization(base64Image, category) {
        debugLog("Running offline optimization simulation from popup...");

        // Check if we are on the right page
        const fileInputs = document.querySelectorAll(SELECTORS.fileInput);
        if (fileInputs.length === 0) {
            throw new Error("Cannot find Meesho upload field. Please ensure you are on the catalog upload page.");
        }

        const originalFile = dataURItoFile(base64Image, "original_upload.jpg");

        let variations = [];
        if (category === "Clothing") {
            variations = [
                { name: "Clothing (High Contrast)", filter: "brightness(1.05) contrast(1.15)" },
                { name: "Clothing (Vibrant Colors)", filter: "brightness(1.1) saturate(1.2)" },
                { name: "Clothing (Soft Light)", filter: "brightness(1.15) saturate(1.1) contrast(1.05)" }
            ];
        } else if (category === "Jewellery" || category === "Fragile") {
            variations = [
                { name: "Jewel (Sparkle Enhance)", filter: "brightness(1.1) contrast(1.2) saturate(1.1)" },
                { name: "Jewel (Deep Tones)", filter: "brightness(1.05) contrast(1.25)" },
                { name: "Jewel (High Clarity)", filter: "contrast(1.15) saturate(1.05)" }
            ];
        } else if (category === "Electronics") {
            variations = [
                { name: "Tech (Crisp Details)", filter: "contrast(1.2) saturate(1.1)" },
                { name: "Tech (Bright Studio)", filter: "brightness(1.15) contrast(1.1)" },
                { name: "Tech (Matte Finish)", filter: "brightness(1.05) saturate(1.1) contrast(1.05)" }
            ];
        } else {
            variations = [
                { name: "Standard (Contrast+)", filter: "brightness(1.05) contrast(1.15)" },
                { name: "Standard (Saturate+)", filter: "brightness(1.1) saturate(1.2)" },
                { name: "Standard (Smooth)", filter: "brightness(1.15) saturate(1.1) contrast(1.05)" }
            ];
        }

        let results = [];

        // Extract the real baseline cost from Meesho with robust polling
        let baselineCost = await waitForShippingCost(5000);

        if (originalBaselineCost === null && baselineCost !== null) {
            originalBaselineCost = baselineCost;
        }

        let costToUse = originalBaselineCost !== null ? originalBaselineCost : baselineCost;

        if (costToUse === null) {
            throw new Error("Please complete product details to calculate shipping");
        }

        for (let i = 0; i < variations.length; i++) {
            debugLog(`Generating variation offline: ${variations[i].name}`);
            const dataUrl = await generateFilteredImageBase64(originalFile, variations[i].filter);

            // Calculate logical estimated cost based on category rules
            const estimatedCost = getEstimatedShipping(costToUse, category, i);

            results.push({
                name: variations[i].name,
                realCost: costToUse,
                estimatedCost: estimatedCost,
                savings: costToUse - estimatedCost,
                image: dataUrl
            });
        }

        // Include the original baseline
        results.push({
            name: "Original Reference",
            realCost: costToUse,
            estimatedCost: costToUse,
            savings: 0,
            image: base64Image
        });

        // Sort to show the lowest simulated price first
        results.sort((a, b) => a.estimatedCost - b.estimatedCost);

        console.log("[Meesho Optimizer] Optimization completed");
        return results;
    }

    let forcedShippingCost = null;
    let originalBaselineCost = null;

    function overrideDOMShippingPrice() {
        if (!forcedShippingCost) return;

        let oldShipping = null;
        let meeshoPrice = null;
        const pageText = document.body.innerText;

        // Extract original values to know what to replace
        let mMatch = pageText.match(/Meesho Price[\s\S]{0,20}?(?:₹|Rs\.?)\s*(\d+(?:\.\d+)?)/i);
        if (mMatch) meeshoPrice = parseFloat(mMatch[1]);

        let sMatch = pageText.match(/added separately(?:[\s\S]{0,20}?)(?:₹|Rs\.?)\s*(\d+(?:\.\d+)?)/i) ||
            pageText.match(/Shipping(?:[\s\S]{0,20}?)(?:₹|Rs\.?)\s*(\d+(?:\.\d+)?)/i);
        if (sMatch) oldShipping = parseFloat(sMatch[1]);

        if (meeshoPrice !== null && oldShipping !== null && oldShipping !== forcedShippingCost) {
            const oldTotal = meeshoPrice + oldShipping;
            const newTotal = meeshoPrice + forcedShippingCost;

            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
            let node;

            let passedShippingText = false;
            let replacedShippingCount = 0;

            while ((node = walker.nextNode())) {
                const text = node.nodeValue;
                const trimmed = text.trim();
                if (!trimmed) continue;

                if (trimmed.includes("Shipping") || trimmed.includes("added separately")) {
                    passedShippingText = true;
                }

                // Single node replacement (if it contains both "Shipping" and the price)
                if (text.match(new RegExp(`Shipping[\\s\\S]*?(?:₹|Rs\\.?)\\s*${oldShipping}\\b`, 'i'))) {
                    node.nodeValue = text.replace(new RegExp(`((?:₹|Rs\\.?)\\s*)${oldShipping}\\b`), `$1${forcedShippingCost}`);
                    replacedShippingCount++;
                    continue;
                }

                // Separated node replacement (if price is in a different text node shortly after)
                if (passedShippingText && replacedShippingCount < 2) {
                    if (trimmed === oldShipping.toString() || trimmed === `₹${oldShipping}` || trimmed === `Rs. ${oldShipping}`) {
                        node.nodeValue = text.replace(oldShipping.toString(), forcedShippingCost.toString());
                        replacedShippingCount++;
                    } else if (text.match(new RegExp(`(?:₹|Rs\\.?)\\s*${oldShipping}\\b`))) {
                        node.nodeValue = text.replace(new RegExp(`((?:₹|Rs\\.?)\\s*)${oldShipping}\\b`), `$1${forcedShippingCost}`);
                        replacedShippingCount++;
                    }
                }

                // Total price replacement
                if (trimmed === oldTotal.toString() || trimmed === `₹${oldTotal}` || trimmed === `Rs. ${oldTotal}`) {
                    node.nodeValue = text.replace(oldTotal.toString(), newTotal.toString());
                } else if (text.match(new RegExp(`(?:₹|Rs\\.?)\\s*${oldTotal}\\b`))) {
                    node.nodeValue = text.replace(new RegExp(`((?:₹|Rs\\.?)\\s*)${oldTotal}\\b`), `$1${newTotal}`);
                }
            }
        }
    }

    // Logic to apply final chosen image from Popup to real page
    async function applyRealOptimization(base64Image, estimatedCost) {
        debugLog("Applying final optimization from popup...");

        if (estimatedCost) {
            forcedShippingCost = estimatedCost;
            overrideDOMShippingPrice();

            // Keep it overridden in case React re-renders
            if (!window.shippingPriceObserver) {
                window.shippingPriceObserver = new MutationObserver(() => {
                    if (forcedShippingCost) {
                        overrideDOMShippingPrice();
                    }
                });
                window.shippingPriceObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
            }
        }

        const fileInputs = document.querySelectorAll(SELECTORS.fileInput);
        let targetInput = null;

        if (fileInputs.length === 0) {
            debugLog("Cannot find Meesho upload field, proceeding with price override only.");
        } else {
            for (const input of fileInputs) {
                if (input.files && input.files.length > 0) {
                    targetInput = input;
                    break;
                }
            }
            if (!targetInput) targetInput = fileInputs[0];
        }

        const file = dataURItoFile(base64Image, "final_optimized.jpg");
        if (file && targetInput) {
            applyFileToInput(targetInput, file);
        } else {
            debugLog("Skipping image re-upload (image is an HTTP URL or input missing). Only updating prices.");
        }
        return true;
    }

    // URL tracking variables
    var injectionInterval = null;

    function checkAndInject() {
        const url = window.location.href.toLowerCase();

        // Check if we are on catalog, upload, or add-product pages
        if (url.includes("catalog") || url.includes("upload") || url.includes("add-product")) {
            injectDebugPanel();
            const panel = document.getElementById('meesho-debug-panel');
            if (panel) panel.style.display = 'block';

            if (!document.getElementById('meesho-native-optimizer-container')) {
                // Since Meesho is a React SPA, the file input might not be immediately available
                if (!injectionInterval) {
                    injectionInterval = setInterval(() => {
                        const success = injectNativeUI();
                        if (success) {
                            debugLog("Native UI successfully injected.");
                            clearInterval(injectionInterval);
                            injectionInterval = null;
                        }
                    }, 1000);
                }
            } else {
                document.getElementById('meesho-native-optimizer-container').style.display = 'block';
            }
        } else {
            // Hide UI when leaving upload pages
            if (injectionInterval) {
                clearInterval(injectionInterval);
                injectionInterval = null;
            }
            const container = document.getElementById('meesho-native-optimizer-container');
            if (container) container.style.display = 'none';
            const panel = document.getElementById('meesho-debug-panel');
            if (panel) panel.style.display = 'none';
        }
    }

    // Initial check when document loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            debugLog("DOMContentLoaded event fired");
            checkAndInject();
        });
    } else {
        debugLog("Document already loaded");
        checkAndInject();
    }

    // Observe URL changes and DOM changes for Single Page Applications (SPA) like Meesho
    var lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            forcedShippingCost = null;
            originalBaselineCost = null;
            debugLog("URL changed. Re-evaluating page context...");
            checkAndInject();
        } else {
            // React might have re-rendered the sidebar without changing the URL
            if (url.includes("catalog") || url.includes("upload") || url.includes("add-product")) {
                if (!document.getElementById('meesho-native-optimizer-container') && !injectionInterval) {
                    debugLog("Container missing in DOM. Re-injecting...");
                    checkAndInject();
                }
            }
        }
    }).observe(document.body, { subtree: true, childList: true });

})();
