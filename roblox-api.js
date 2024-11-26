const axios = require("axios");
require("dotenv").config();

const API_KEY = process.env.API_KEY;
const BASE_URL = "https://apis.roblox.com/cloud/v2/groups";

const apiClient = axios.create({
    headers: {
        "x-api-key": API_KEY
    }
});

async function fetchMemberships(groupId) {
    let url = `${BASE_URL}/${groupId}/memberships?maxPageSize=100`;
    let memberships = [];
    let nextPageToken;

    do {
        const response = await apiClient.get(url);
        memberships = memberships.concat(response.data.groupMemberships);
        nextPageToken = response.data.nextPageToken;

        if (nextPageToken !== "") {
            url = `${BASE_URL}/${groupId}/memberships?maxPageSize=100&pageToken=${nextPageToken}`;
        }
    } while (nextPageToken !== "");

    return memberships;
};

async function fetchRoles(groupId) {
    let url = `${BASE_URL}/${groupId}/roles?maxPageSize=100`;
    let roles = [];
    let nextPageToken;

    do {
        const response = await apiClient.get(url);
        roles = roles.concat(response.data.groupRoles);
        nextPageToken = response.data.nextPageToken;

        if (nextPageToken !== "") {
            url = `${BASE_URL}/${groupId}/roles?maxPageSize=100&pageToken=${nextPageToken}`;
        }
    } while (nextPageToken !== "");

    return roles;
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
    fetchMemberships,
    fetchRoles,
    updateRank
};