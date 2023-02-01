"use strict";

const { Octokit } = require("@octokit/rest");
const axios = require("axios");
require("dotenv").config();

const octokit = new Octokit({
  auth: process.env.GITHUB_PAT,
});

/**
 * Star a repository using an authenticated user
 * @param {string} owner
 * @param {string} repo
 * @returns
 */
const starRepository = async (owner, repo) => {
  await octokit.activity.starRepoForAuthenticatedUser({
    owner,
    repo,
  });

  return;
};

/**
 * Add reactions to a release using an authenticated user
 * @param {string} owner
 * @param {string} repo
 * @param {string} releaseId
 * @returns {Promise<void>}
 */
const addReactionsToRelease = async (owner, repo, releaseId) => {
  const reactions = ["+1", "heart", "hooray", "rocket"];

  for (const reaction of reactions) {
    console.log(`Adding ${reaction} reaction to ${releaseId}`);
    await octokit.reactions.createForRelease({
      owner,
      repo,
      release_id: releaseId,
      content: reaction,
    });
  }

  return;
};

const main = async () => {
  const org = "fairdataihub";

  // get all repositories in the organization
  const repos = await octokit.repos.listForOrg({
    org,
    per_page: 100,
  });

  const listOfRepos = repos.data.map((repo) => repo.name);

  // loop through all repositories
  for (const repo of listOfRepos) {
    // star the repository
    console.log(`Starring ${org}/${repo}`);
    await starRepository(org, repo);

    // get the latest release
    const releases = await octokit.repos.listReleases({
      owner: org,
      repo,
      per_page: 100,
    });

    // add reactions to all releases
    for (const release of releases.data) {
      console.log(`Adding reactions to ${release.name}`);
      await addReactionsToRelease(org, repo, release.id);
    }
  }
};

main();
