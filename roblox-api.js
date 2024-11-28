const axios = require("axios");
require("dotenv").config();

const API_KEY = process.env.API_KEY;
const BASE_URL = "https://apis.roblox.com/cloud/v2/groups";

const apiClient = axios.create({
    headers: {
        "x-api-key": API_KEY
    }
});

async function fetchMembership(groupId, userId) {
    const url = `${BASE_URL}/${groupId}/memberships?maxPageSize=1&filter=user=='users/${userId}'`;

    const response = await apiClient.get(url);

    return response.data.groupMemberships[0];
};

async function fetchRoleByRank(groupId, rank) {
    let url = `${BASE_URL}/${groupId}/roles?maxPageSize=100`;
    let nextPageToken;

    do {
        const response = await apiClient.get(nextPageToken ? `${url}&pageToken=${nextPageToken}` : url);

        const role = response.data.groupRoles.find(r => r.rank === rank);
        if (role != null) {
            return role;
        };

        nextPageToken = response.data.nextPageToken;
    } while (nextPageToken !== "");

    throw new Error("Role not found");
};

async function updateRank(groupId, membershipId, userId, roleId) {
    const url = `${BASE_URL}/${groupId}/memberships/${membershipId}`;
    const body = {
        user: `users/${userId}`,
        role: `groups/${groupId}/roles/${roleId}`
    };

    const response = await apiClient.patch(url, body);
    
    return response.data;
};

module.exports = {
    fetchMembership,
    fetchRoleByRank,
    updateRank
};