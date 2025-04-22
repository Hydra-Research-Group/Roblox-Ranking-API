function proxyValidator(req, res, next) {
    const system = req.params.system?.toUpperCase();

    if (!system || !process.env[`PROXY_WEBHOOK_${system}`]) {
        return res.status(404).json({
            error: "Invalid system"
        });
    }

    req.webhookUrl = process.env[`PROXY_WEBHOOK_${system}`];
    next();
}

module.exports = {
    proxyValidator
};