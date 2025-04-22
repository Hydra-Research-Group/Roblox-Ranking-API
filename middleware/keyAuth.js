function accessKeyAuth(req, res, next) {
    const clientKey = req.headers['x-access-key'];

    if (!clientKey || clientKey !== process.env.ACCESS_API_KEY) {
        return res.status(403).json({
            error: "Forbidden"
        });
    };

    next();
};
function adminKeyAuth(req, res, next) {
    const adminKey = req.headers['x-admin-key'];

    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
        return res.status(403).json({
            error: "Forbidden"
        });
    };

    next();
};

module.exports = {
    accessKeyAuth,
    adminKeyAuth
};