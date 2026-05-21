const API = "https://meesho-tou3.onrender.com";
let usersData = [];

document.addEventListener("DOMContentLoaded", () => {
    // Set default expiry date to 30 days from now
    const expiryInput = document.getElementById("expiry");
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    expiryInput.value = futureDate.toISOString().split('T')[0];

    loadUsers();

    document.getElementById("addUserBtn").addEventListener("click", addUser);
    document.getElementById("searchInput").addEventListener("input", renderTable);
    document.getElementById("filterStatus").addEventListener("change", renderTable);
});

async function loadUsers() {
    try {
        const res = await fetch(`${API}/admin/users`);
        const data = await res.json();
        if (data.success) {
            usersData = data.users;
            renderTable();
        }
    } catch (error) {
        console.error("Failed to load users", error);
    }
}

async function addUser() {
    const email = document.getElementById("email").value.trim();
    const plan = document.getElementById("plan").value;
    const expiry = document.getElementById("expiry").value;

    if (!email) {
        showMessage("Email is required", "error");
        return;
    }

    try {
        const res = await fetch(`${API}/admin/add-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, plan, expiry })
        });

        const data = await res.json();

        if (data.success) {
            showMessage("User added successfully ✅", "success");
            document.getElementById("email").value = "";
            loadUsers(); // refresh table
        } else {
            showMessage(data.message || "Failed to add user", "error");
        }
    } catch (err) {
        showMessage("Connection error", "error");
    }
}

async function toggleStatus(email, currentStatus) {
    const newStatus = !currentStatus;
    try {
        const res = await fetch(`${API}/admin/toggle-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, isActive: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            loadUsers();
        }
    } catch (err) {
        console.error("Failed to toggle status", err);
    }
}

function showMessage(msg, type) {
    const msgEl = document.getElementById("statusMessage");
    msgEl.innerText = msg;
    msgEl.style.display = "block";
    msgEl.style.color = type === "success" ? "var(--success)" : "var(--danger)";

    setTimeout(() => {
        msgEl.style.display = "none";
    }, 4000);
}

function renderTable() {
    const tbody = document.getElementById("usersTableBody");
    const searchQuery = document.getElementById("searchInput").value.toLowerCase();
    const filterStatus = document.getElementById("filterStatus").value;

    tbody.innerHTML = "";

    const filteredUsers = usersData.filter(user => {
        const matchSearch = user.email.toLowerCase().includes(searchQuery);
        const matchStatus = filterStatus === "all" ||
            (filterStatus === "active" && user.isActive) ||
            (filterStatus === "blocked" && !user.isActive);
        return matchSearch && matchStatus;
    });

    if (filteredUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No users found</td></tr>`;
        return;
    }

    filteredUsers.forEach(user => {
        const tr = document.createElement("tr");

        const creationDate = user._id ? new Date(parseInt(user._id.substring(0, 8), 16) * 1000).toLocaleDateString() : "Unknown";
        const expiryDate = user.expiry ? new Date(user.expiry).toLocaleDateString() : "No Expiry";
        const statusBadge = user.isActive ? `<span class="badge active">Active</span>` : `<span class="badge blocked">Blocked</span>`;
        const planBadge = user.plan === 'paid' ? `<span class="badge plan-paid">Paid</span>` : `<span class="badge plan-free">Free</span>`;
        const deviceDisplay = user.deviceId ? `<span style="font-family: monospace; color: var(--text-muted);" title="${user.deviceId}">${user.deviceId.substring(0, 15)}...</span>` : `<span style="color: var(--text-muted);">Unbound</span>`;

        tr.innerHTML = `
            <td><strong>${user.email}</strong></td>
            <td>${planBadge}</td>
            <td>${statusBadge}</td>
            <td>${creationDate}</td>
            <td>${expiryDate}</td>
            <td>${deviceDisplay}</td>
            <td>
                <button class="action-btn ${user.isActive ? 'disable' : 'activate'}" onclick="toggleStatus('${user.email}', ${user.isActive})">
                    ${user.isActive ? 'Disable' : 'Activate'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}