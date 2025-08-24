const config = {
  apiBaseUrl: "", // keep empty → requests go through Vercel proxy
  upiVPA: "9811318629@superyes",
  payeeName: "Pixel Pulse",
  fundraisingGoal: 5000,
  campaignTitle: "Support Our Community Project!",
  campaignDescription:
    "Help us build a brighter future. Every contribution, big or small, makes a significant impact. Let's reach our goal together!",
  campaignEndDate: "2025-08-31T23:59:59",
};

const campaignTitleEl = document.getElementById("campaignTitle");
const campaignDescriptionEl = document.getElementById("campaignDescription");
const paymentForm = document.getElementById("paymentForm");
const qrCanvas = document.getElementById("qrCanvas");
const qrMessage = document.getElementById("qrMessage");
const utrSection = document.getElementById("utrSection");
const acknowledgement = document.getElementById("acknowledgement");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const totalRaisedEl = document.getElementById("totalRaised");
const donorCountEl = document.getElementById("donorCount");
const goalAmountEl = document.getElementById("goalAmount");
const donationsList = document.getElementById("donationsList");
const topDonorsList = document.getElementById("topDonorsList");
const countdownEl = document.getElementById("countdown");

function initializeUI() {
  campaignTitleEl.textContent = config.campaignTitle;
  campaignDescriptionEl.textContent = config.campaignDescription;
  goalAmountEl.textContent = `₹${config.fundraisingGoal.toLocaleString(
    "en-IN"
  )}`;
  setupSocialSharing();
}

// ✅ FIXED WebSocket setup
function setupWebSocket() {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}/api/ws`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "NEW_DONATION") {
      const { newDonation, total, donorCount, topDonors } = data.payload;
      updateProgress(total, donorCount);
      prependDonation(newDonation);
      updateTopDonors(topDonors);
    }
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected. Reconnecting in 5s...");
    setTimeout(setupWebSocket, 5000);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
}

async function initialLoad() {
  try {
    const [statsRes, donationsRes, topDonorsRes] = await Promise.all([
      fetch(`/api/stats`), // ✅ directly call /api/... (Vercel rewrites handle backend)
      fetch(`/api/donations`),
      fetch(`/api/top-donors`),
    ]);

    if (!statsRes.ok || !donationsRes.ok || !topDonorsRes.ok)
      throw new Error("Failed to fetch initial data");

    const { total, donorCount } = await statsRes.json();
    const donations = await donationsRes.json();
    const topDonors = await topDonorsRes.json();

    updateProgress(total, donorCount);
    renderDonations(donations);
    updateTopDonors(topDonors);
  } catch (err) {
    console.error("Error on initial load:", err);
    donationsList.innerHTML = "<li>Could not load donations.</li>";
    topDonorsList.innerHTML = "<li>Could not load top donors.</li>";
  }
}

function updateProgress(total, donorCount) {
  const percentage = Math.min((total / config.fundraisingGoal) * 100, 100);
  progressFill.style.width = `${percentage}%`;
  const formattedTotal = total.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });
  const formattedGoal = config.fundraisingGoal.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });

  progressText.textContent = `Raised: ${formattedTotal} / ${formattedGoal}`;
  totalRaisedEl.textContent = formattedTotal;
  donorCountEl.textContent = donorCount;
}

function renderDonations(donations) {
  donationsList.innerHTML = "";
  if (!donations || donations.length === 0) {
    donationsList.innerHTML =
      '<li class="donation-item">No recent donations yet.</li>';
    return;
  }
  donations.forEach(prependDonation);
}

function prependDonation(d) {
  const li = document.createElement("li");
  li.className = "donation-item";
  li.innerHTML = `<span><i class="fa-solid fa-circle-user" style="margin-right: 8px; color: var(--accent-color);"></i> ${d.name} donated ₹${d.amount}</span><span>"${d.message}"</span>`;
  donationsList.prepend(li);
}

function updateTopDonors(topDonors) {
  topDonorsList.innerHTML = "";

  if (!topDonors || topDonors.length === 0) {
    topDonorsList.innerHTML =
      '<li class="donation-item">No top donors yet. Be the first!</li>';
    return;
  }

  topDonors.forEach((d, index) => {
    const li = document.createElement("li");
    li.className = "donation-item";
    const rankIcon =
      index === 0 ? "fa-trophy" : index === 1 ? "fa-medal" : "fa-award";
    li.innerHTML = `<span><i class="fa-solid ${rankIcon}" style="margin-right: 8px; color: var(--accent-color);"></i> ${
      d.name
    }</span><span class="leaderboard-amount">₹${parseFloat(
      d.totalDonated
    ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>`;
    topDonorsList.appendChild(li);
  });
}

paymentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = parseFloat(document.getElementById("amount").value);
  if (isNaN(amount) || amount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }
  generateQRCode();
});

function generateQRCode() {
  const name = document.getElementById("name").value.trim();
  const amount = parseFloat(document.getElementById("amount").value);
  const message = document.getElementById("message").value.trim();

  const upiURI = `upi://pay?pa=${encodeURIComponent(
    config.upiVPA
  )}&pn=${encodeURIComponent(config.payeeName)}&am=${amount.toFixed(
    2
  )}&tn=${encodeURIComponent(`${name} - ${message}`)}&cu=INR`;

  qrCanvas.innerHTML = "";
  new QRCode(qrCanvas, {
    text: upiURI,
    width: 200,
    height: 200,
    colorDark: "#080F0F",
    colorLight: "#FCEFF9",
  });

  qrCanvas.style.display = "block";
  qrMessage.style.display = "block";
  utrSection.style.display = "block";
}

async function acknowledgePayment() {
  const name = document.getElementById("name").value.trim();
  const amount = parseFloat(document.getElementById("amount").value);
  const message = document.getElementById("message").value.trim();
  const utr = document.getElementById("utr").value.trim();

  if (!utr || !/^\d{12}$/.test(utr)) {
    alert("Please enter a valid 12-digit UTR.");
    return;
  }

  try {
    const response = await fetch(`/api/donate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, amount, message, utr }),
    });
    const result = await response.json();

    if (response.ok) {
      acknowledgement.textContent = `Thank you, ${name}! Your donation has been recorded.`;
      acknowledgement.style.display = "block";
      resetForm();
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    console.error("Error submitting donation:", err);
    alert("Error submitting donation. Please try again.");
  }
}

function resetForm() {
  paymentForm.reset();
  qrCanvas.style.display = "none";
  qrMessage.style.display = "none";
  utrSection.style.display = "none";
  setTimeout(() => {
    acknowledgement.style.display = "none";
  }, 5000);
}

function setupSuggestionButtons() {
  document.querySelectorAll(".suggestion-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("amount").value = button.dataset.amount;
    });
  });
}

function updateCountdown() {
  const endDate = new Date(config.campaignEndDate).getTime();
  const interval = setInterval(() => {
    const now = new Date().getTime();
    const distance = endDate - now;

    if (distance < 0) {
      clearInterval(interval);
      countdownEl.innerHTML = "Campaign Ended";
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    countdownEl.innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }, 1000);
}

function setupSocialSharing() {
  const shareText = encodeURIComponent(
    `Join me in supporting the "${config.campaignTitle}"! Check out their campaign here: ${window.location.href}`
  );
  document.getElementById(
    "share-whatsapp"
  ).href = `https://api.whatsapp.com/send?text=${shareText}`;
}

document.addEventListener("DOMContentLoaded", () => {
  initializeUI();
  initialLoad();
  setupWebSocket();
  updateCountdown();
  setupSuggestionButtons();
});
