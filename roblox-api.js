const axios = require("axios");
const logger = require("./logger");
const { getRoles, saveRoles } = require("./cache");
require("dotenv").config({ quiet: true });

const API_KEY = process.env.API_KEY;
const GROUPS_URL = "https://apis.roblox.com/cloud/v2/groups";
const USERS_URL = "https://users.roblox.com/v1/usernames/users";
const THUMBNAILS_URL = "https://thumbnails.roblox.com/v1/users/avatar-headshot";

const ROBLOX_SYSTEM_ROLE_NAME = "Member";

const apiClient = axios.create({
    headers: { "x-api-key": API_KEY },
    timeout: 8000,
});

const publicClient = axios.create({ timeout: 8000 });

async function _paginate(baseUrl, itemsKey, filter = null) {
    const results = [];
    let nextPageToken;

    do {
        const url = nextPageToken ? `${baseUrl}&pageToken=${nextPageToken}` : baseUrl;
        const res = await apiClient.get(url);
        const items = res.data[itemsKey] ?? [];

        for (const item of items) {
            if (!filter || filter(item)) {
                results.push(item);
            }
        }

        nextPageToken = res.data.nextPageToken;
    } while (nextPageToken);

    return results;
}

function _resolveSystemRoleConflict(candidates) {
    if (candidates.length <= 1) return candidates[0] ?? null;

    const filtered = candidates.filter(r => r.displayName !== ROBLOX_SYSTEM_ROLE_NAME);
    const pool = filtered.length > 0 ? filtered : candidates;

    const sorted = [...pool].sort((a, b) => Number(a.id) - Number(b.id));
    const chosen = sorted[0];

    logger.warn(
        `Resolved duplicate rank ${candidates[0].rank} - ` +
        `using "${chosen.displayName}" (id=${chosen.id}). ` +
        `All candidates: [${candidates.map(r => `${r.id}(${r.displayName})`).join(", ")}]`
    );
    return chosen;
}

async function fetchAllRoles(groupId) {
    const cached = getRoles(groupId);
    if (cached) return cached;

    const raw = await _paginate(
        `${GROUPS_URL}/${groupId}/roles?maxPageSize=100`,
        "groupRoles",
        role => role.rank > 0
    );

    const roles = raw
        .map(role => ({
            id: role.id,
            rank: role.rank,
            displayName: role.displayName,
        }))
        .sort((a, b) => a.rank - b.rank);

    saveRoles(groupId, roles);
    return roles;
}

async function fetchRoleByRank(groupId, rank) {
    const roles = await fetchAllRoles(groupId);
    const candidates = roles.filter(r => r.rank === rank);
    return _resolveSystemRoleConflict(candidates);
}

async function fetchMembership(groupId, userId) {
    const res = await apiClient.get(
        `${GROUPS_URL}/${groupId}/memberships?maxPageSize=1&filter=user=='users/${userId}'`
    );
    return res.data.groupMemberships?.[0] ?? null;
}

async function fetchMemberRank(groupId, userId) {
    const membership = await fetchMembership(groupId, userId);
    if (!membership) return null;

    const roleId = membership.role?.split("/").pop();
    if (!roleId) return null;

    const roles = await fetchAllRoles(groupId);
    const role = roles.find(r => r.id === roleId);
    if (!role) return null;

    return { rank: role.rank, roleId: role.id };
}

async function resolveUser(username) {
    const lookupRes = await publicClient.post(
        USERS_URL,
        { usernames: [username], excludeBannedUsers: false }
    );

    const user = lookupRes.data.data?.[0];
    if (!user) return null;

    const { id: userId, name: resolvedUsername, displayName } = user;

    let avatarUrl = null;
    try {
        const thumbRes = await publicClient.get(THUMBNAILS_URL, {
            params: {
                userIds: userId,
                size: "150x150",
                format: "Png",
                isCircular: false,
            },
        });
        avatarUrl = thumbRes.data.data?.[0]?.imageUrl ?? null;
    } catch (err) {
        logger.warn(`Failed to fetch avatar for userId=${userId}: ${err.message}`);
    }

    return { userId, username: resolvedUsername, displayName, avatarUrl };
}

async function assignRole(groupId, membershipId, roleId) {
    logger.info(`Assigning role | groupId=${groupId} membershipId=${membershipId} roleId=${roleId}`);
    const res = await apiClient.post(
        `${GROUPS_URL}/${groupId}/memberships/${membershipId}:assignRole`,
        { role: `groups/${groupId}/roles/${roleId}` }
    );
    return res.data;
}

async function unassignRole(groupId, membershipId, roleId) {
    logger.info(`Unassigning role | groupId=${groupId} membershipId=${membershipId} roleId=${roleId}`);
    const res = await apiClient.post(
        `${GROUPS_URL}/${groupId}/memberships/${membershipId}:unassignRole`,
        { role: `groups/${groupId}/roles/${roleId}` }
    );
    return res.data;
}

async function acceptJoinRequest(groupId, userId) {
    const res = await apiClient.post(
        `${GROUPS_URL}/${groupId}/join-requests/${userId}:accept`,
        {}
    );
    return res.data;
}

module.exports = {
    fetchAllRoles,
    fetchRoleByRank,
    fetchMembership,
    fetchMemberRank,
    resolveUser,
    assignRole,
    unassignRole,
    acceptJoinRequest,
};