const NodeCache = require("node-cache");

const membershipsCache = new NodeCache({ stdTTL: 600, checkperiod: 60 }); // Memberships stays 10 minutes in cache
const rolesCache = new NodeCache({ stdTTL: 1200, checkperiod: 120 }); // Roles stays 20 minutes in cache

function getMembership(userId) {
    return membershipsCache.get(userId);
};

function saveMembership(userId, membershipId) {
    membershipsCache.set(userId, membershipId);

    return membershipId;
};

function getRoleByRank(rank) {
    return rolesCache.get(rank);
};

function saveRoleByRank(rank, roleId) {
    rolesCache.set(rank, roleId);

    return roleId;
};

function clearAllCaches() {
    membershipsCache.flushAll();
    rolesCache.flushAll();
};

function getCacheSizes() {
    return {
        memberships: membershipsCache.keys().length,
        roles: rolesCache.keys().length
    }
};

module.exports = {
    getMembership,
    saveMembership,
    getRoleByRank,
    saveRoleByRank,
    clearAllCaches,
    getCacheSizes
};