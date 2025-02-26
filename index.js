import express from "express";
import cors from "cors";
import axios from "axios";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
let insights = null;


app.use(cors({
    origin: "https://dashboardwithnyikotwy.netlify.app", 
    methods: "GET,POST"
}));


const db = new pg.Client({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

db.connect()
    .then(() => console.log(" Connected to PostgreSQL Database"))
    .catch(err => console.error(" Database Connection Error:", err));


const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const API_KEY = process.env.API_KEY;

const headers = { "Content-Type": "application/json" };


if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}


const upload = multer({ dest: "uploads/" });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


app.use(express.static(path.join(__dirname, "public")));


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


app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});


app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    try {
        const data = fs.readFileSync(req.file.path, "utf8");
        fs.unlinkSync(req.file.path); 

        const insightPrompt = generateInsightPrompt("2024", "02", data);
        const response = await axios.post(`${API_URL}?key=${API_KEY}`, insightPrompt, { headers });

        let insightsText = response.data.candidates[0].content.parts[0].text;
        insights = JSON.parse(insightsText.replace(/```json|```/g, "").trim());

        console.log(" Insights Processed:", insights);
        res.json({ message: "Processing completed!", insights });

    } catch (err) {
        console.error(" Error processing request:", err);
        res.status(500).json({ message: "Error processing request." });
    }
});


app.get("/api/insights", (req, res) => {
    if (insights) {
        res.json(insights);
    } else {
        res.status(404).json({ message: "No insights available. Please upload a file first." });
    }
});


app.post("/insights", async (req, res) => {
    const { year, month } = req.body;

    if (!year || !month) {
        return res.status(400).json({ message: "Year and month are required." });
    }

    try {
        const insightPrompt = generateInsightPrompt(year, month);
        const response = await axios.post(`${API_URL}?key=${API_KEY}`, insightPrompt, { headers });

        let insightsText = response.data.candidates[0].content.parts[0].text;
        insights = JSON.parse(insightsText.replace(/```json|```/g, "").trim());

        console.log(" Insights Updated:", insights);
        res.json({ message: "Insights updated!", insights });
    } catch (error) {
        console.error(" Error fetching insights:", error);
        res.status(500).json({ message: "Error fetching insights." });
    }
});


app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await db.query("SELECT * FROM user_id WHERE name = $1", [username]);

        if (result.rows.length === 0) {
            return res.status(401).json({ message: "User not found" });
        }

        const user = result.rows[0];

        if (user.password === password) {
            res.json({ message: "Login successful", redirect: "/dashboard" });
        } else {
            res.status(401).json({ message: "Incorrect password or username" });
        }
    } catch (err) {
        console.error(" Error fetching password:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});


app.get("/api/test", (req, res) => {
    res.json({ message: "API is working!" });
});


app.listen(port, () => {
    console.log(` Server is running on port ${port}`);
});
