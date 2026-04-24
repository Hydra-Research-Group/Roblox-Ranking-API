const NodeCache = require("node-cache");

const membershipsCache = new NodeCache({ stdTTL: 600, checkperiod: 60 });
const rolesCache = new NodeCache({ stdTTL: 900, checkperiod: 90 });

function membershipKey(groupId, userId) {
    return `${groupId}:${userId}`;
}

function getMembership(groupId, userId) {
    return membershipsCache.get(membershipKey(groupId, userId)) ?? null;
}

function saveMembership(groupId, userId, membershipId) {
    membershipsCache.set(membershipKey(groupId, userId), membershipId);
}

function deleteMembership(groupId, userId) {
    membershipsCache.del(membershipKey(groupId, userId));
}

function getRoles(groupId) {
    return rolesCache.get(String(groupId)) ?? null;
}

function saveRoles(groupId, roles) {
    rolesCache.set(String(groupId), roles);
}

function deleteRoles(groupId) {
    rolesCache.del(String(groupId));
}

function clearAllCaches() {
    membershipsCache.flushAll();
    rolesCache.flushAll();
}

module.exports = {
    getMembership,
    saveMembership,
    deleteMembership,
    getRoles,
    saveRoles,
    deleteRoles,
    clearAllCaches,
};