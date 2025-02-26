import express from "express";
import axios from "axios";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// Setup __dirname (necessary for ES module)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
let insights = null;

// PostgreSQL Database Setup
const db = new pg.Client({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

try {
    db.connect();
    console.log("Connected to the database");
} catch (err) {
    console.error("Error connecting to the database", err);
}

// Load API Key
const api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=";
const api_key = process.env.API_KEY;

const header = { "Content-Type": "application/json" };

// Ensure uploads directory exists
if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}

// Multer Storage Setup
const upload = multer({ dest: "uploads/" });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "public")));

// 🔥 Global Function for Generating Insights Prompt
const generateInsightPrompt = (year, month, data = null) => {
    return {
        contents: [{
            parts: [{
                text: `
Analyze the booking data for ${year}-${month} and generate a single JSON object:
{
  "date": "${year}-${month}",
  "totalArrivals": <total arrivals>,
  "arrivalPercentage": <arrival percentage>,
  "memberArrivals": <total member arrivals>,
  "generalGuestArrivals": <total general guest arrivals>,
  "departuresToday": <total departures>,
  "occupancyRate": <average occupancy rate>,
  "ADR": <average daily rate>,
  "guestBirthdays": [ { "name": "John Doe", "birthday": "YYYY-MM-DD" } ],
  "ageGroupSegmentation": { "child": <total child count>, "adult": <total adult count>, "senior": <total senior count> },
  "canceledBookings": { "count": <total cancellations>, "percentage": <cancellation percentage> },
  "frequentUnits": [ { "unitId": "A101", "bookings": <most frequent bookings count> } ],
  "monthlyIncome": <total income for the selected month>,
  "yearlyIncome": <total income for the selected year>
}
${data ? `\nBooking Data:\n${data}` : ''}
Return only raw JSON.
                `
            }]
        }]
    };
};

// 🔹 Serve Login Page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🔹 Serve Dashboard Page
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// 🔥 Upload Route (Processes File and Fetches Insights)
app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    try {
        const data = fs.readFileSync(req.file.path, "utf8");
        fs.unlinkSync(req.file.path); // Delete file after reading

        const insightPrompt = generateInsightPrompt("2024", "02", data);
        const response = await axios.post(api_url + api_key, insightPrompt, { headers: { "Content-Type": "application/json" } });

        let insightsText = response.data.candidates[0].content.parts[0].text;
        insights = JSON.parse(insightsText.replace(/```json|```/g, "").trim());

        console.log("Insights Processed:", insights);
        res.json({ message: "Processing completed!", insights });

    } catch (err) {
        console.error("Error processing request:", err);
        res.status(500).json({ message: "Error processing request." });
    }
});


// 🔥 API Route for Insights Data
app.get("/api/insights", (req, res) => {
    if (insights) {
        res.json(insights);
    } else {
        res.status(404).json({ message: "No insights available. Please upload a file first." });
    }
});

// 🔥 Fetch Insights for Given Month/Year
app.post("/insights", async (req, res) => {
    const { year, month } = req.body;

    if (!year || !month) {
        return res.status(400).send("Year and month are required.");
    }

    try {
        const insightPrompt = generateInsightPrompt(year, month);
        const response = await axios.post(api_url + api_key, insightPrompt, { headers: header });

        let insightsText = response.data.candidates[0].content.parts[0].text;
        insights = JSON.parse(insightsText.replace(/```json|```/g, "").trim()); // Update global insights

        console.log(insights);
        res.json({ message: "Insights updated!", insights });
    } catch (error) {
        console.error("Error fetching insights:", error);
        res.status(500).send("Error fetching insights.");
    }
});

// 🔥 Login Route
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await db.query("SELECT * FROM user_id WHERE name = $1", [username]);

        if (result.rows.length === 0) {
            return res.redirect("/?message=User not found");
        }

        const user = result.rows[0];

        if (user.password === password) {
            res.redirect("/dashboard");
        } else {
            res.redirect("/?message=Incorrect password or username");
        }
    } catch (err) {
        console.error("Error fetching password:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Start Server
app.listen(port, () => {
    console.log(`Your server is running on port ${port}`);
});

