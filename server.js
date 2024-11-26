const express = require("express");
const {
    fetchMemberships,
    fetchRoles,
    updateRank
} = require("./roblox-api");
const {
    getMembership,
    saveMembership,
    getRoleByRank,
    saveRoles,
    clearAllCaches
} = require("./cache");
require("dotenv").config();

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => {
    res.json({
        message: "Roblox Ranking API, developed by Hydra Research Group, is alive!"
    });
});

app.post("/refresh-roles/:groupId", async (req, res) => {
    const { groupId } = req.params;

    try {
        const roles = await fetchRoles(groupId);
        saveRoles(roles);

        res.json({
            message: "Roles cache refreshed",
            groupId
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    };
});

app.patch("/update-rank/:groupId", async (req, res) => {
    const { groupId } = req.params;
    const { userId, rank } = req.body;

    try {
        let membershipId = getMembership(userId);
        if (!membershipId) {
            const memberships = await fetchMemberships(groupId);
            memberships.forEach((member) => {
                saveMembership(member.user.split("/")[1], member.path.split("/")[3])
            });

            membershipId = getMembership(userId);
        };

        if (!membershipId) {
            return res.status(404).json({
                error: "Membership not found"
            });
        };

        let roleId = getRoleByRank(rank);
        if (!roleId) {
            const roles = await fetchRoles(groupId);
            saveRoles(roles);

            roleId = getRoleByRank(rank);
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