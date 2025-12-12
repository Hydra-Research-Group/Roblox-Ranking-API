const NodeCache = require("node-cache");

const membershipsCache = new NodeCache({ stdTTL: 600, checkperiod: 60 });
const rolesCache = new NodeCache({ stdTTL: 1800, checkperiod: 180 });

function membershipKey(groupId, userId) {
    return `${groupId}:${userId}`;
}

function roleKey(groupId, rank) {
    return `${groupId}:${rank}`;
}

function getMembership(groupId, userId) {
    return membershipsCache.get(membershipKey(groupId, userId));
}

function saveMembership(groupId, userId, membershipId) {
    membershipsCache.set(membershipKey(groupId, userId), membershipId);
    return membershipId;
}

function getRoleByRank(groupId, rank) {
    return rolesCache.get(roleKey(groupId, rank));
}

function saveRoleByRank(groupId, rank, role) {
    rolesCache.set(roleKey(groupId, rank), role);
    return role;
}

function clearAllCaches() {
    membershipsCache.flushAll();
    rolesCache.flushAll();
}

module.exports = {
    getMembership,
    saveMembership,
    getRoleByRank,
    saveRoleByRank,
    clearAllCaches
};