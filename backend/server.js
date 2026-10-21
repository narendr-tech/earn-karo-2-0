require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

// Render provides PORT automatically.
// Locally, the backend uses port 5000.
const PORT = Number(process.env.PORT || 5000);

// Basic configuration checks
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error("ERROR: JWT_SECRET is missing or must be at least 32 characters.");
    process.exit(1);
}

if (
    !process.env.DB_HOST ||
    !process.env.DB_NAME ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD
) {
    console.error("ERROR: Database environment variables are missing.");
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// PostgreSQL connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
        rejectUnauthorized: true
    },
    connectionTimeoutMillis: 10000
});

// Database error handling
pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL error:", err.message);
});

// Root / health check
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Earn Karo 2.0 Backend is running!"
    });
});

// Database connection check
app.get("/api/db-check", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS server_time");

        res.json({
            success: true,
            message: "PostgreSQL connected successfully!",
            databaseTime: result.rows[0].server_time
        });
    } catch (err) {
        console.error("Database connection error:", err.message);

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

    const token = authHeader.substring(7);

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: "earn-karo-2-0"
        });

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
    if (!req.user || req.user.role !== "admin") {
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

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

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

        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({
                success: false,
                message: "Password must be between 8 and 72 characters"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users
                (name, email, password_hash, role)
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

// List active earning apps
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
            } catch (err) {
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

            const amount = Number(commission_amount ?? 0);

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
                    typeof description === "string" ? description.trim() : "",
                    typeof category === "string" && category.trim()
                        ? category.trim()
                        : "Other",
                    referral_url.trim(),
                    typeof commission_type === "string" && commission_type.trim()
                        ? commission_type.trim()
                        : "Varies",
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

// Unknown API routes
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found"
    });
});

// General error handler
app.use((err, req, res, next) => {
    console.error("Server error:", err.message);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        success: false,
        message: "Internal server error"
    });
});

// Start server on Render's assigned port or local port 5000
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Earn Karo 2.0 backend listening on port ${PORT}`);
});

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`${signal} received. Shutting down...`);

    const forceExit = setTimeout(() => {
        console.error("Shutdown timed out.");
        process.exit(1);
    }, 10000);

    forceExit.unref();

    server.close(async () => {
        try {
            await pool.end();
            console.log("Database pool closed.");
            process.exit(0);
        } catch (err) {
            console.error("Shutdown error:", err.message);
            process.exit(1);
        }
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));