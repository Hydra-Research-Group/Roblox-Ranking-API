const axios = require("axios");
const logger = require("./logger");
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

async function fetchMembership(groupId, userId) {
    const url = `${GROUPS_URL}/${groupId}/memberships?maxPageSize=1&filter=user=='users/${userId}'`;
    const res = await apiClient.get(url);
    return res.data.groupMemberships?.[0] ?? null;
}

async function fetchRoleByRank(groupId, rank) {
    let nextPageToken;
    const baseUrl = `${GROUPS_URL}/${groupId}/roles?maxPageSize=100`;
    const candidates = [];

    do {
        const url = nextPageToken
            ? `${baseUrl}&pageToken=${nextPageToken}`
            : baseUrl;

        const res = await apiClient.get(url);

        for (const role of res.data.groupRoles) {
            if ((role.rank === rank) && (typeof role.id === "string")) {
                candidates.push(role);
            }
        }

        nextPageToken = res.data.nextPageToken;
    } while (nextPageToken);

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => Number(a.id) - Number(b.id));
    if (candidates.length > 1) {
        logger.warn(`Multiple roles found for rank=${rank} in groupId=${groupId}: [${candidates.map(r => `${r.id}(${r.displayName})`).join(", ")}] - using ${candidates[0].id}(${candidates[0].displayName})`);
    }

    return candidates[0];
}

async function fetchAllRoles(groupId) {
    let nextPageToken;
    const baseUrl = `${GROUPS_URL}/${groupId}/roles?maxPageSize=100`;
    const roles = [];

    do {
        const url = nextPageToken
            ? `${baseUrl}&pageToken=${nextPageToken}`
            : baseUrl;

        const res = await apiClient.get(url);

        for (const role of res.data.groupRoles) {
            if (role.rank > 0) {
                roles.push({
                    id: role.id,
                    rank: role.rank,
                    displayName: role.displayName,
                });
            }
        }

        nextPageToken = res.data.nextPageToken;
    } while (nextPageToken);

    roles.sort((a, b) => a.rank - b.rank);
    return roles;
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

    return {
        userId,
        username: resolvedUsername,
        displayName,
        avatarUrl,
    };
}

async function assignRole(groupId, membershipId, roleId) {
    const url = `${GROUPS_URL}/${groupId}/memberships/${membershipId}:assignRole`;
    const body = {
        role: `groups/${groupId}/roles/${roleId}`
    };

    logger.info(`Assigning role | groupId=${groupId} membershipId=${membershipId} roleId=${roleId}`);

    const res = await apiClient.post(url, body);
    return res.data;
}

async function unassignRole(groupId, membershipId, roleId) {
    const url = `${GROUPS_URL}/${groupId}/memberships/${membershipId}:unassignRole`;
    const body = {
        role: `groups/${groupId}/roles/${roleId}`
    };

    logger.info(`Unassigning role | groupId=${groupId} membershipId=${membershipId} roleId=${roleId}`);

    const res = await apiClient.post(url, body);
    return res.data;
}

module.exports = {
    fetchMembership,
    fetchRoleByRank,
    fetchAllRoles,
    resolveUser,
    assignRole,
    unassignRole
};