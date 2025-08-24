document.addEventListener("DOMContentLoaded", () => {
  // --- CONFIGURATION ---
  const config = {
    // The API server's address is now managed in one place.
    API_BASE_URL: "",
  };

  // --- TAB NAVIGATION LOGIC ---
  const tabs = document.querySelectorAll(".tab-link");
  const tabContents = document.querySelectorAll(".tab-content");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = document.getElementById(tab.dataset.tab);
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      tabContents.forEach((content) => content.classList.remove("active"));
      target.classList.add("active");
    });
  });

  // --- HELPER: REVERSE GEOCODING ---
  async function getAreaName(lat, lon) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
      );
      if (!response.ok) return "Unknown Area";
      const data = await response.json();
      return (
        data.address.suburb ||
        data.address.city ||
        data.display_name.split(",")[0]
      );
    } catch (error) {
      console.error("Reverse geocoding failed:", error);
      return "Unknown Area";
    }
  }

  // --- NGO REGISTRATION (GET FOOD) ---
  const addNgoLocationBtn = document.getElementById("addNgoLocationBtn");
  const ngoLocationStatus = document.getElementById("ngoLocationStatus");
  const ngoLatInput = document.getElementById("ngoLat");
  const ngoLonInput = document.getElementById("ngoLon");
  const getFoodForm = document.getElementById("getFoodForm");
  const getFoodAcknowledgement = document.getElementById(
    "getFoodAcknowledgement"
  );

  addNgoLocationBtn.addEventListener("click", () => {
    if (navigator.geolocation) {
      ngoLocationStatus.textContent = "Fetching your location...";
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          ngoLatInput.value = lat;
          ngoLonInput.value = lon;
          const areaName = await getAreaName(lat, lon);
          ngoLocationStatus.textContent = `✅ Location: ${areaName} (Lat: ${lat.toFixed(
            4
          )}, Lon: ${lon.toFixed(4)})`;
          ngoLocationStatus.style.color = "#2e7d32";
        },
        () => {
          ngoLocationStatus.textContent =
            "❌ Unable to retrieve location. Please allow access.";
          ngoLocationStatus.style.color = "#d32f2f";
        }
      );
    } else {
      ngoLocationStatus.textContent =
        "Geolocation is not supported by this browser.";
    }
  });

  getFoodForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newNgo = {
      name: document.getElementById("ngoName").value,
      contact_person: document.getElementById("contactPerson").value,
      email: document.getElementById("ngoEmail").value, // Collect email
      phone: document.getElementById("ngoPhone").value,
      address: document.getElementById("ngoAddress").value,
      lat: parseFloat(ngoLatInput.value),
      lon: parseFloat(ngoLonInput.value),
      needs: document.getElementById("ngoNeeds").value,
    };

    if (!newNgo.lat || !newNgo.lon) {
      alert("Please add your location before registering.");
      return;
    }

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/ngos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newNgo),
      });
      if (!response.ok) throw new Error("Network response was not ok");
      const result = await response.json();
      console.log("API Response:", result);
      getFoodAcknowledgement.textContent = `Thank you, ${newNgo.name}! Your organization has been registered.`;
      getFoodAcknowledgement.style.display = "block";
      getFoodForm.reset();
      ngoLocationStatus.textContent = "";
    } catch (error) {
      console.error("Failed to register NGO:", error);
      alert(
        "There was an error registering your organization. Please try again."
      );
    }
  });

  // --- DONOR (SEND FOOD) ---
  const findNgosBtn = document.getElementById("findNgosBtn");
  const donorLocationStatus = document.getElementById("donorLocationStatus");
  const nearbyNgosList = document.getElementById("nearbyNgosList");
  const donationFormSection = document.getElementById("donationFormSection");
  const selectedNgoName = document.getElementById("selectedNgoName");
  const selectedNgoIdInput = document.getElementById("selectedNgoId");

  findNgosBtn.addEventListener("click", () => {
    if (navigator.geolocation) {
      donorLocationStatus.textContent = "Finding nearby NGOs...";
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const donorLat = position.coords.latitude;
          const donorLon = position.coords.longitude;
          const areaName = await getAreaName(donorLat, donorLon);
          donorLocationStatus.textContent = `✅ Your location: ${areaName}. Searching...`;
          donorLocationStatus.style.color = "#2e7d32";
          await findAndDisplayNearbyNgos(donorLat, donorLon);
        },
        () => {
          donorLocationStatus.textContent =
            "❌ Unable to retrieve location. Please allow access.";
          donorLocationStatus.style.color = "#d32f2f";
        }
      );
    } else {
      donorLocationStatus.textContent =
        "Geolocation is not supported by this browser.";
    }
  });

  async function findAndDisplayNearbyNgos(donorLat, donorLon) {
    nearbyNgosList.innerHTML = '<li class="ngo-item">Searching...</li>';
    donationFormSection.style.display = "none";

    try {
      const response = await fetch(
        `${config.API_BASE_URL}/api/ngos/nearby?lat=${donorLat}&lon=${donorLon}`
      );
      if (!response.ok) throw new Error("Failed to fetch nearby NGOs");
      const nearby = await response.json();
      nearbyNgosList.innerHTML = "";

      if (nearby.length > 0) {
        nearby.forEach((ngo) => {
          const li = document.createElement("li");
          li.className = "ngo-item";
          li.dataset.id = ngo.id;
          li.dataset.name = ngo.name;
          li.innerHTML = `
                        <h3>${ngo.name}</h3>
                        <p>${ngo.address}</p>
                        <p><strong>Needs:</strong> ${ngo.needs}</p>
                        <p class="distance">${parseFloat(ngo.distance).toFixed(
                          2
                        )} km away</p>
                    `;
          li.addEventListener("click", () => handleNgoSelection(li));
          nearbyNgosList.appendChild(li);
        });
      } else {
        nearbyNgosList.innerHTML =
          '<li class="ngo-item">No NGOs found within a 10km radius.</li>';
      }
    } catch (error) {
      console.error("Error finding NGOs:", error);
      nearbyNgosList.innerHTML =
        '<li class="ngo-item">Could not load NGOs. Please try again.</li>';
    }
  }

  function handleNgoSelection(selectedLi) {
    document
      .querySelectorAll(".ngo-item")
      .forEach((item) => item.classList.remove("selected"));
    selectedLi.classList.add("selected");

    const ngoId = selectedLi.dataset.id;
    const ngoName = selectedLi.dataset.name;

    selectedNgoIdInput.value = ngoId;
    selectedNgoName.textContent = ngoName;
    donationFormSection.style.display = "block";
    donationFormSection.scrollIntoView({ behavior: "smooth" });
  }

  const sendFoodForm = document.getElementById("sendFoodForm");
  const sendFoodAcknowledgement = document.getElementById(
    "sendFoodAcknowledgement"
  );

  sendFoodForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const donationDetails = {
      ngo_id: document.getElementById("selectedNgoId").value,
      donor_name: document.getElementById("donorName").value,
      donor_email: document.getElementById("donorEmail").value, // Collect email
      donor_phone: document.getElementById("donorPhone").value,
      donor_type: document.getElementById("donorType").value,
      food_description: document.getElementById("foodDescription").value,
      quantity: document.getElementById("foodQuantity").value,
    };

    if (!donationDetails.ngo_id) {
      alert("Please select an NGO from the list above.");
      return;
    }

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/donations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(donationDetails),
      });
      if (!response.ok) throw new Error("Network response was not ok");

      const result = await response.json();
      console.log("API Response:", result);

      sendFoodAcknowledgement.textContent = `Thank you, ${donationDetails.donor_name}! Your donation details have been sent. The selected NGO will contact you shortly.`;
      sendFoodAcknowledgement.style.display = "block";
      sendFoodForm.reset();
      donationFormSection.style.display = "none";
      document
        .querySelectorAll(".ngo-item")
        .forEach((item) => item.classList.remove("selected"));
    } catch (error) {
      console.error("Failed to submit donation:", error);
      alert("There was an error submitting your donation. Please try again.");
    }
  });
});
