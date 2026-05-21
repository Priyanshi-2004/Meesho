const API = "https://meesho-tou3.onrender.com";
const deviceId = navigator.userAgent;

const safeStorage = {
    get: (keys, cb) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(keys, cb);
        } else {
            const result = {};
            keys.forEach(k => result[k] = localStorage.getItem(k));
            cb(result);
        }
    },
    set: (data, cb) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set(data, cb);
        } else {
            Object.keys(data).forEach(k => localStorage.setItem(k, data[k]));
            if (cb) cb();
        }
    },
    remove: (keys, cb) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.remove(keys, cb);
        } else {
            keys.forEach(k => localStorage.removeItem(k));
            if (cb) cb();
        }
    }
};

function showToast(message, isSuccess = true) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.style.backgroundColor = isSuccess ? "#10b981" : "#ef4444";
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

async function verifyAccess() {
    const name = document.getElementById("userName").value.trim();
    const email = document.getElementById("email").value.trim();
    const msgEl = document.getElementById("authMessage");
    const buyBtn = document.getElementById("buyAccessBtn");
    const supportBtn = document.getElementById("contactSupportBtn");

    if (!name || !email) {
        msgEl.style.color = "red";
        msgEl.style.display = "block";
        msgEl.innerText = "Please enter your name and email address.";
        return;
    }

    try {
        const res = await fetch(`${API}/check-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, deviceId })
        });

        const data = await res.json();

        msgEl.style.display = "block";
        buyBtn.style.display = "none";
        supportBtn.style.display = "none";

        if (data.access) {
            msgEl.style.color = "#10b981";
            msgEl.innerText = "Access granted ✅";
            
            safeStorage.set({ token: email, userName: name }, () => {
                updateProfileHeader(name);
                setTimeout(() => {
                    document.getElementById("login").style.display = "none";
                    document.getElementById("app").style.display = "flex";
                }, 500);
            });
        } else {
            msgEl.style.color = "#ef4444";
            msgEl.innerText = data.message || "Access denied ❌";

            if (data.message.includes("purchase")) {
                buyBtn.style.display = "block";
            } else if (data.message.includes("support")) {
                supportBtn.style.display = "block";
            }
        }
    } catch (error) {
        console.error("Verification failed:", error);
        msgEl.style.color = "#ef4444";
        msgEl.style.display = "block";
        msgEl.innerText = "Connection error. Is the backend running?";
    }
}

function handleSignOut(e) {
    e.preventDefault();
    safeStorage.remove(["token", "userName"], () => {
        document.getElementById("app").style.display = "none";
        document.getElementById("login").style.display = "flex";
    });
}

function updateProfileHeader(name) {
    if (name) {
        const displayEl = document.getElementById("userNameDisplay");
        const avatarEl = document.getElementById("userAvatar");
        if (displayEl) displayEl.textContent = name.toUpperCase();
        if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
    }
}

function renderRealResults(data, category) {
    const container = document.getElementById("results");
    container.innerHTML = "";
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(2, 1fr)";
    container.style.gap = "20px";

    data.slice(0, 4).forEach((item) => {
        const div = document.createElement("div");
        div.className = "action-card";
        div.style.textAlign = "center";
        div.style.background = "rgba(30, 41, 59, 0.5)";
        div.style.border = "1px solid var(--border-color)";
        div.style.borderRadius = "12px";
        div.style.padding = "15px";

        const routeName = item.name;
        const isOriginal = item.name === "Original Reference";
        const realCostText = item.realCost === -1 ? "N/A" : `₹${item.realCost}`;
        const estimatedCostText = `₹${item.estimatedCost}`;
        const savingsText = item.savings > 0 ? `Savings: ₹${item.savings}` : "";

        div.innerHTML = `
      <div style="margin-bottom: 10px; display:flex; justify-content:center; overflow:hidden; height:100px; border-radius:8px;">
        <img src="${item.image}" style="width:100%; object-fit:cover;" />
      </div>
      <p style="color:var(--text-muted); font-size: 11px; margin-bottom: 5px;">${routeName}</p>
      <div style="font-size: 12px; margin-bottom: 5px;">
        Current: <span style="text-decoration: ${isOriginal ? 'none' : 'line-through'}; color: #ef4444;">${realCostText}</span>
      </div>
      <div style="font-size: 14px; margin-bottom: 5px; color: #10b981; font-weight: bold;">
        ${isOriginal ? 'Original Image' : `Est. Optimized: ${estimatedCostText}`}
      </div>
      <div style="font-size: 12px; color: #07f49e; font-weight: bold; margin-bottom: 10px; height: 14px;">
        ${savingsText}
      </div>
      <button class="primary-btn apply-opt-btn" style="padding: 8px; font-size: 13px;">Apply Suggestion</button>
    `;

        const btn = div.querySelector('.apply-opt-btn');
        btn.addEventListener('click', () => {
            btn.innerText = "Applying to Meesho...";
            btn.style.opacity = "0.7";

            const finishApply = (successMsg) => {
                showToast(successMsg || `Optimization for ${routeName} applied!`);
                btn.innerText = "Applied ✅";
                btn.style.background = "#10b981";
                btn.style.opacity = "1";
                btn.disabled = true;

                safeStorage.get(["token"], async (res) => {
                    if (res.token) {
                        try {
                            await fetch(`${API}/add-history`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ email: res.token, route: routeName, cost: item.cost, category: category })
                            });
                        } catch (err) {
                            console.error("Failed to save history", err);
                        }
                    }
                });
            };

            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs && tabs[0]) {
                        const tabId = tabs[0].id;
                        const sendApplyMessage = () => {
                            chrome.tabs.sendMessage(tabId, {
                                action: "applyRealOptimization",
                                image: item.image,
                                estimatedCost: item.estimatedCost
                            }, (resp) => {
                                if (chrome.runtime.lastError) {
                                    finishApply("Cannot connect to page. Refresh and try again.");
                                    return;
                                }
                                if (resp && resp.success) {
                                    finishApply("Successfully applied to Meesho page!");
                                } else {
                                    finishApply("Failed to apply. Check page manually.");
                                }
                            });
                        };

                        chrome.tabs.sendMessage(tabId, { action: "ping" }, (res) => {
                            if (chrome.runtime.lastError) {
                                chrome.scripting.executeScript({
                                    target: { tabId: tabId },
                                    files: ["content.js"]
                                }, () => {
                                    chrome.scripting.insertCSS({
                                        target: { tabId: tabId },
                                        files: ["content.css"]
                                    }, () => {
                                        setTimeout(sendApplyMessage, 500);
                                    });
                                });
                            } else {
                                sendApplyMessage();
                            }
                        });
                    } else {
                        finishApply("No active tab found.");
                    }
                });
            } else {
                finishApply("Applied locally.");
            }
        });

        container.appendChild(div);
    });
}

async function generate() {
    const category = document.getElementById('popup-category')?.value || "Clothing";
    
    if (!window.uploadedImage) {
        showToast("Please upload an image first!", false);
        return;
    }

    const container = document.getElementById("results");
    container.innerHTML = `
        <div style='grid-column: 1 / -1; text-align: center; margin-top: 20px;'>
            <div id="loading-status" style="color: #07f49e; font-weight: bold; margin-bottom: 10px;">Detecting shipping...</div>
            <div class="loader" style="margin: 0 auto; border: 3px solid #334155; border-top: 3px solid #07f49e; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        </div>
    `;
    container.style.display = "block";

    setTimeout(() => {
        const status = document.getElementById("loading-status");
        if(status) status.innerText = "Analyzing variations...";
    }, 1500);

    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
                const tabId = tabs[0].id;
                const sendOptMessage = () => {
                    chrome.tabs.sendMessage(tabId, { 
                        action: "runRealOptimization", 
                        image: window.uploadedImage, 
                        category: category 
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            container.innerHTML = `<div style='color: #ef4444; margin-top: 20px;'>Error: Cannot connect to page. Please refresh the Meesho tab and try again.</div>`;
                            return;
                        }
                        if (!response || !response.success) {
                            container.innerHTML = `<div style='color: #ef4444; margin-top: 20px;'>Error: ${response ? response.error : 'Unknown error'}</div>`;
                            return;
                        }

                        renderRealResults(response.results, category);
                    });
                };

                chrome.tabs.sendMessage(tabId, { action: "ping" }, (res) => {
                    if (chrome.runtime.lastError) {
                        chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            files: ["content.js"]
                        }, () => {
                            if (chrome.runtime.lastError) {
                                container.innerHTML = `<div style='color: #ef4444; margin-top: 20px;'>Error: Please refresh the Meesho Catalog Upload page.</div>`;
                                return;
                            }
                            chrome.scripting.insertCSS({
                                target: { tabId: tabId },
                                files: ["content.css"]
                            }, () => {
                                setTimeout(sendOptMessage, 500);
                            });
                        });
                    } else {
                        sendOptMessage();
                    }
                });
            } else {
                container.innerHTML = `<div style='color: #ef4444; margin-top: 20px;'>Error: No active tab found.</div>`;
            }
        });
    } else {
        container.innerHTML = `<div style='color: #ef4444; margin-top: 20px;'>Error: Must run as a Chrome extension.</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    safeStorage.get(["token", "userName"], async (result) => {
        if (result.token) {
            if (result.userName) updateProfileHeader(result.userName);
            try {
                const res = await fetch(`${API}/check-user`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: result.token, deviceId })
                });
                const data = await res.json();
                if (data.access) {
                    document.getElementById("login").style.display = "none";
                    document.getElementById("app").style.display = "flex";
                } else {
                    safeStorage.remove(["token"]);
                }
            } catch (err) {
                console.error("Auto-login failed:", err);
            }
        }
    });

    document.getElementById('verifyAccessBtn')?.addEventListener('click', verifyAccess);

    document.getElementById('buyAccessBtn')?.addEventListener('click', () => {
        window.open('https://example.com/buy', '_blank');
    });

    document.getElementById('contactSupportBtn')?.addEventListener('click', () => {
        window.open('mailto:support@example.com', '_blank');
    });

    document.getElementById('browseFilesBtn')?.addEventListener('click', () => {
        document.getElementById('imageInput')?.click();
    });

    document.getElementById('runGeneratorBtn')?.addEventListener('click', async () => {
        await generate();
    });

    document.getElementById('imageInput')?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const fileName = file.name;

            const reader = new FileReader();
            reader.onload = function (event) {
                window.uploadedImage = event.target.result;
                const msgEl = document.getElementById("loaded-manifest-msg");
                const msgContainer = document.getElementById("loaded-manifest-container");
                if (msgEl && msgContainer) {
                    msgEl.innerHTML = `<strong>Image Ready:</strong> ${fileName}`;
                    msgContainer.style.display = "block";
                    showToast("Image loaded successfully!");
                }
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
});