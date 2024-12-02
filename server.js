const express = require("express");
const {
    fetchMembership,
    fetchRoleByRank,
    updateRank
} = require("./roblox-api");
const {
    getMembership,
    saveMembership,
    getRoleByRank,
    saveRoleByRank,
    clearAllCaches,
    getCacheSizes
} = require("./cache");
require("dotenv").config();

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => {
    const cacheSizes = getCacheSizes();

    res.json({
        message: "Roblox Ranking API, developed by Hydra Research Group, is alive!",
        cacheSizes: {
            memberships: cacheSizes.memberships,
            roles: cacheSizes.roles
        }
    });
});

app.patch("/update-rank/:groupId", async (req, res) => {
    const { groupId } = req.params;
    const { userId, rank } = req.body;

    try {
        let membershipId = getMembership(userId);
        if (!membershipId) {
            const membership = await fetchMembership(groupId, userId);

            if (membership !== undefined) {
                membershipId = saveMembership(membership.user.split("/")[1], membership.path.split("/")[3]);
            };
        };

        if (!membershipId) {
            return res.status(404).json({
                error: "Membership not found"
            });
        };

        let roleId = getRoleByRank(rank);
        if (!roleId) {
            const role = await fetchRoleByRank(groupId, rank);

            if (role !== undefined) {
                roleId = saveRoleByRank(role.rank, role.id);
            };
        };

        if (!roleId) {
            return res.status(404).json({
                error: "Role not found"
            });
        };

        const response = await updateRank(groupId, membershipId, userId, roleId);
        res.json(response);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    };
});

app.post("/clear-cache", async (_, res) => {
    clearAllCaches();
    
    res.json({
        message: "All caches cleared"
    });
});

app.listen(PORT, () => console.log(`API is running on port ${PORT}`));