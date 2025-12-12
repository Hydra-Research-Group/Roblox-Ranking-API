const crypto = require("crypto");

function safeCompare(a, b) {
    if (!a || !b) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function accessKeyAuth(req, res, next) {
    const key = req.headers["x-access-key"];
    if (!safeCompare(key, process.env.ACCESS_API_KEY)) {
        return res.status(403).json({ error: "Forbidden" });
    }
    next();
}

function adminKeyAuth(req, res, next) {
    const key = req.headers["x-admin-key"];
    if (!safeCompare(key, process.env.ADMIN_API_KEY)) {
        return res.status(403).json({ error: "Forbidden" });
    }
    next();
}

module.exports = {
    accessKeyAuth,
    adminKeyAuth
};