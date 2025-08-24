require("dotenv").config();
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("Client connected");
  ws.on("close", () => {
    clients.delete(ws);
    console.log("Client disconnected");
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    await connection.execute(`
            CREATE TABLE IF NOT EXISTS donations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                message TEXT NOT NULL,
                utr VARCHAR(50) UNIQUE,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    connection.release();
    console.log("Database initialized");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}
initializeDatabase();

// --- API ENDPOINTS ---
app.post("/api/donate", async (req, res) => {
  const { name, amount, message, utr } = req.body;
  if (!name || !amount || !message || !utr) {
    return res.status(400).json({ error: "All fields are required" });
  }
  try {
    await pool.execute(
      "INSERT INTO donations (name, amount, message, utr) VALUES (?, ?, ?, ?)",
      [name, amount, message, utr]
    );

    const [totalRows] = await pool.execute(
      "SELECT SUM(amount) as totalAmount, COUNT(id) as donorCount FROM donations"
    );
    const [topDonorsRows] = await pool.execute(
      "SELECT name, SUM(amount) as totalDonated FROM donations GROUP BY name ORDER BY totalDonated DESC LIMIT 5"
    );

    broadcast({
      type: "NEW_DONATION",
      payload: {
        newDonation: { name, amount, message },
        total: totalRows[0].totalAmount || 0,
        donorCount: totalRows[0].donorCount || 0,
        topDonors: topDonorsRows,
      },
    });

    res.json({ success: true, message: "Donation acknowledged!" });
  } catch (err) {
    console.error(err);
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "This UTR has already been submitted." });
    }
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/donations", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT name, amount, message, timestamp FROM donations ORDER BY timestamp DESC LIMIT 10"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT SUM(amount) as totalAmount, COUNT(id) as donorCount FROM donations"
    );
    res.json({
      total: rows[0].totalAmount || 0,
      donorCount: rows[0].donorCount || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/top-donors", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT name, SUM(amount) as totalDonated FROM donations GROUP BY name ORDER BY totalDonated DESC LIMIT 5"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`API Server running on http://0.0.0.0:${PORT}`);
});
