function proxyValidator(req, res, next) {
    const system = req.params.system?.toUpperCase();

    if (!system || !process.env[`DISCORD_WEBHOOK_${system}`]) {
        return res.status(404).json({
            error: "Invalid system"
        });
    }
    
    req.webhookUrl = process.env[`DISCORD_WEBHOOK_${system}`];
    next();
}

module.exports = {
    proxyValidator
};