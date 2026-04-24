const axios = require("axios");
const logger = require("./logger");
const { getRoles, saveRoles } = require("./cache");
require("dotenv").config({ quiet: true });

const API_KEY = process.env.API_KEY;
const GROUPS_URL = "https://apis.roblox.com/cloud/v2/groups";
const USERS_URL = "https://users.roblox.com/v1/usernames/users";
const THUMBNAILS_URL = "https://thumbnails.roblox.com/v1/users/avatar-headshot";

const apiClient = axios.create({
    headers: {
        "x-api-key": API_KEY
    },
    timeout: 8000
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

async function fetchAllRoles(groupId) {
    const cached = getRoles(groupId);
    if (cached) return cached;

    const raw = await _paginate(
        `${GROUPS_URL}/${groupId}/roles?maxPageSize=100`,
        "groupRoles",
        role => role.rank > 0
    );

    const roles = raw
        .map(role => ({ id: role.id, rank: role.rank, displayName: role.displayName }))
        .sort((a, b) => a.rank - b.rank);

    saveRoles(groupId, roles);
    return roles;
}

async function fetchRoleByRank(groupId, rank) {
    const roles = await fetchAllRoles(groupId);
    const candidates = roles.filter(r => r.rank === rank);

    if (candidates.length === 0) return null;

    if (candidates.length > 1) {
        logger.warn(
            `Multiple roles found for rank=${rank} in groupId=${groupId}: ` +
            `[${candidates.map(r => `${r.id}(${r.displayName})`).join(", ")}] ` +
            `- using ${candidates[0].id}(${candidates[0].displayName})`
        );
    }

    return candidates[0];
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
            }
        });
        avatarUrl = thumbRes.data.data?.[0]?.imageUrl ?? null;
    } catch (err) {
        logger.warn(`Failed to fetch avatar for userId=${userId}: ${err.message}`);
    }

    return { userId, username: resolvedUsername, displayName, avatarUrl };
}

async function assignRole(groupId, membershipId, roleId) {
    logger.info(`Assigning role | groupId=${groupId} membershipId=${membershipId} roleId=${roleId}`);
    const url = `${GROUPS_URL}/${groupId}/memberships/${membershipId}:assignRole`;
    const res = await apiClient.post(url, {
        role: `groups/${groupId}/roles/${roleId}`
    });
    return res.data;
}

async function unassignRole(groupId, membershipId, roleId) {
    logger.info(`Unassigning role | groupId=${groupId} membershipId=${membershipId} roleId=${roleId}`);
    const url = `${GROUPS_URL}/${groupId}/memberships/${membershipId}:unassignRole`;
    const res = await apiClient.post(url, {
        role: `groups/${groupId}/roles/${roleId}`
    });
    return res.data;
}

async function acceptJoinRequest(groupId, userId) {
    const requests = await _paginate(
        `${GROUPS_URL}/${groupId}/join-requests?maxPageSize=1&filter=user=='users/${userId}'`,
        "groupJoinRequests"
    );

    const joinRequest = requests[0] ?? null;
    if (!joinRequest) {
        const err = new Error("Join request not found");
        err.status = 404;
        throw err;
    }

    const joinRequestId = joinRequest.path.split("/").pop();
    const res = await apiClient.post(
        `${GROUPS_URL}/${groupId}/join-requests/${joinRequestId}:approve`,
        {}
    );
    return res.data;
}

async function exileMember(groupId, membershipId) {
    const res = await apiClient.delete(
        `${GROUPS_URL}/${groupId}/memberships/${membershipId}`
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
    exileMember,
};