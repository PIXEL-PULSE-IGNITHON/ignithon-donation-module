require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");

const app = express();
// Use port from .env file, or default to 4000
const PORT = process.env.PORT || 4000;

// --- CACHE SETUP ---
const CACHE_PATH = path.join(__dirname, "ngos.json");

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());

// --- MYSQL CONNECTION POOL ---
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// --- DATABASE INITIALIZATION ---
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    // Updated NGOs table to include email
    await connection.execute(`
            CREATE TABLE IF NOT EXISTS ngos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                contact_person VARCHAR(255),
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                address TEXT,
                needs TEXT,
                lat DECIMAL(10, 8) NOT NULL,
                lon DECIMAL(11, 8) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    // New table to store donation records
    await connection.execute(`
            CREATE TABLE IF NOT EXISTS donations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ngo_id INT,
                donor_name VARCHAR(255) NOT NULL,
                donor_email VARCHAR(255) NOT NULL,
                donor_phone VARCHAR(20),
                donor_type VARCHAR(100),
                food_description TEXT,
                quantity VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ngo_id) REFERENCES ngos(id)
            )
        `);
    connection.release();
    console.log("Database tables (ngos, donations) are ready.");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}
initializeDatabase();

// --- CACHE HELPER FUNCTIONS ---
async function readCache() {
  try {
    const data = await fs.readFile(CACHE_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeCache(data) {
  await fs.writeFile(CACHE_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function updateCacheFromDB() {
  const [rows] = await pool.execute(
    "SELECT * FROM ngos ORDER BY created_at DESC"
  );
  await writeCache(rows);
  return rows;
}

// --- API ENDPOINTS ---

// Register a new NGO
app.post("/api/ngos", async (req, res) => {
  const { name, contact_person, email, phone, address, needs, lat, lon } =
    req.body;
  if (!name || !email || !lat || !lon) {
    return res
      .status(400)
      .json({ error: "Name, email, and location are required fields." });
  }
  try {
    const [result] = await pool.execute(
      "INSERT INTO ngos (name, contact_person, email, phone, address, needs, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [name, contact_person, email, phone, address, needs, lat, lon]
    );
    await updateCacheFromDB();
    res
      .status(201)
      .json({
        success: true,
        message: "NGO registered successfully!",
        id: result.insertId,
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while registering NGO." });
  }
});

// Find nearby NGOs
app.get("/api/ngos/nearby", async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res
      .status(400)
      .json({ error: "Latitude and longitude are required." });
  }
  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);
  const radius = 10;

  try {
    let ngos = await readCache();
    if (ngos.length === 0) {
      console.log("Cache is empty. Fetching from database...");
      ngos = await updateCacheFromDB();
    }
    const nearbyNgos = ngos
      .map((ngo) => ({
        ...ngo,
        distance: getDistance(userLat, userLon, ngo.lat, ngo.lon),
      }))
      .filter((ngo) => ngo.distance < radius)
      .sort((a, b) => a.distance - b.distance);
    res.json(nearbyNgos.slice(0, 20));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while finding nearby NGOs." });
  }
});

// Submit a new donation
app.post("/api/donations", async (req, res) => {
  const {
    ngo_id,
    donor_name,
    donor_email,
    donor_phone,
    donor_type,
    food_description,
    quantity,
  } = req.body;
  if (!ngo_id || !donor_name || !donor_email) {
    return res
      .status(400)
      .json({ error: "NGO selection, donor name, and email are required." });
  }
  try {
    await pool.execute(
      "INSERT INTO donations (ngo_id, donor_name, donor_email, donor_phone, donor_type, food_description, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        ngo_id,
        donor_name,
        donor_email,
        donor_phone,
        donor_type,
        food_description,
        quantity,
      ]
    );
    // Here you would trigger an email notification in a real application
    console.log(
      `Donation received for NGO ID ${ngo_id} from ${donor_email}. An email notification should be sent.`
    );
    res
      .status(201)
      .json({
        success: true,
        message: "Donation details recorded successfully.",
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while recording donation." });
  }
});

// --- HELPER FUNCTION for distance calculation ---
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    0.5 -
    Math.cos(dLat) / 2 +
    (Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      (1 - Math.cos(dLon))) /
      2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Help Hunger API Server running on http://localhost:${PORT}`);
});
