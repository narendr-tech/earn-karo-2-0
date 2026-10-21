require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Database connection error logging
pool.on("error", (err) => {
    console.error("Unexpected database error:", err.message);
});

// Health check
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Earn Karo 2.0 Backend is running!"
    });
});

// Database check
app.get("/api/db-check", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS server_time");

        res.json({
            success: true,
            message: "PostgreSQL connected successfully!",
            databaseTime: result.rows[0].server_time
        });
    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Please login first"
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
}

// Admin permission middleware
function requireAdmin(req, res, next) {
    if (req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Admin access required"
        });
    }

    next();
}

// Register
app.post("/api/auth/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();

        if (cleanName.length < 2 || cleanName.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Name must be between 2 and 100 characters"
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address"
            });
        }

        if (typeof password !== "string" || password.length < 8 || password.length > 72) {
            return res.status(400).json({
                success: false,
                message: "Password must be between 8 and 72 characters"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, role)
             VALUES ($1, $2, $3, 'user')
             RETURNING id, name, email, role, created_at`,
            [cleanName, cleanEmail, passwordHash]
        );

        res.status(201).json({
            success: true,
            message: "Registration successful",
            user: result.rows[0]
        });
    } catch (err) {
        if (err.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "This email is already registered"
            });
        }

        console.error("Registration error:", err.message);

        res.status(500).json({
            success: false,
            message: "Registration failed"
        });
    }
});

// Login
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const result = await pool.query(
            `SELECT id, name, email, password_hash, role
             FROM users
             WHERE email = $1`,
            [email.trim().toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];
        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "2h",
                issuer: "earn-karo-2-0"
            }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error("Login error:", err.message);

        res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }
});

// Current logged-in user
app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, role, created_at
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (err) {
        console.error("User lookup error:", err.message);

        res.status(500).json({
            success: false,
            message: "Unable to fetch user"
        });
    }
});

// Public list of active earning apps
app.get("/api/apps", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, description, category, referral_url,
                    commission_type, commission_amount, created_at
             FROM earning_apps
             WHERE status = 'active'
             ORDER BY id DESC`
        );

        res.json({
            success: true,
            apps: result.rows
        });
    } catch (err) {
        console.error("Apps error:", err.message);

        res.status(500).json({
            success: false,
            message: "Unable to load apps"
        });
    }
});

// Admin: add an earning app
app.post(
    "/api/admin/apps",
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const {
                name,
                description,
                category,
                referral_url,
                commission_type,
                commission_amount
            } = req.body;

            if (
                typeof name !== "string" ||
                !name.trim() ||
                typeof referral_url !== "string" ||
                !referral_url.trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message: "App name and referral URL are required"
                });
            }

            let parsedUrl;

            try {
                parsedUrl = new URL(referral_url.trim());
            } catch {
                return res.status(400).json({
                    success: false,
                    message: "Enter a valid referral URL"
                });
            }

            if (!["https:", "http:"].includes(parsedUrl.protocol)) {
                return res.status(400).json({
                    success: false,
                    message: "Referral URL must use HTTP or HTTPS"
                });
            }

            const amount = Number(commission_amount || 0);

            if (!Number.isFinite(amount) || amount < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Commission amount must be a non-negative number"
                });
            }

            const result = await pool.query(
                `INSERT INTO earning_apps
                    (name, description, category, referral_url,
                     commission_type, commission_amount)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [
                    name.trim(),
                    description || "",
                    category || "Other",
                    referral_url.trim(),
                    commission_type || "Varies",
                    amount
                ]
            );

            res.status(201).json({
                success: true,
                message: "Earning app added successfully",
                app: result.rows[0]
            });
        } catch (err) {
            console.error("Add app error:", err.message);

            res.status(500).json({
                success: false,
                message: "Unable to add app"
            });
        }
    }
);

// Start server
const PORT = Number(process.env.PORT || 5000);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error("JWT_SECRET is missing or too short in .env");
    process.exit(1);
}

const server = app.listen(PORT, () => {
    console.log(`Earn Karo 2.0 backend running at http://localhost:${PORT}`);
});

async function shutdown() {
    server.close();
    await pool.end();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);