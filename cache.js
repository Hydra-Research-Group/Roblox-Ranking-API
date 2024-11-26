const NodeCache = require("node-cache");

const membershipsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const rolesCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

function getMembership(userId) {
    return membershipsCache.get(userId);
};

function saveMembership(userId, membershipId) {
    membershipsCache.set(userId, membershipId);
};

function getRoleByRank(rank) {
    return rolesCache.get(rank);
};

function saveRoles(roles) {
    roles.forEach((role) => rolesCache.set(role.rank, role.id));
};

function clearAllCaches() {
    membershipsCache.flushAll();
    rolesCache.flushAll();
};

module.exports = {
    getMembership,
    saveMembership,
    getRoleByRank,
    saveRoles,
    clearAllCaches
};