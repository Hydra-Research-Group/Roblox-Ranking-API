const axios = require("axios");
require("dotenv").config({ quiet: true });

const API_KEY = process.env.API_KEY;
const BASE_URL = "https://apis.roblox.com/cloud/v2/groups";

const apiClient = axios.create({
    headers: {
        "x-api-key": API_KEY
    },
    timeout: 8000
});

async function fetchMembership(groupId, userId) {
    const url = `${BASE_URL}/${groupId}/memberships?maxPageSize=1&filter=user=='users/${userId}'`;
    const res = await apiClient.get(url);
    return res.data.groupMemberships?.[0] ?? null;
}

async function fetchRoleByRank(groupId, rank) {
    let nextPageToken;
    const baseUrl = `${BASE_URL}/${groupId}/roles?maxPageSize=100`;

    do {
        const url = nextPageToken
            ? `${baseUrl}&pageToken=${nextPageToken}`
            : baseUrl;

        const res = await apiClient.get(url);
        const role = res.data.groupRoles.find(r => r.rank === rank);
        if (role && typeof role.id === "string") return role;

        nextPageToken = res.data.nextPageToken;
    } while (nextPageToken);

    return null;
}

async function updateRank(groupId, membershipId, userId, roleId) {
    const url = `${BASE_URL}/${groupId}/memberships/${membershipId}`;
    const body = {
        user: `users/${userId}`,
        role: `groups/${groupId}/roles/${roleId}`
    };

    const res = await apiClient.patch(url, body);
    return res.data;
}

module.exports = {
    fetchMembership,
    fetchRoleByRank,
    updateRank
};