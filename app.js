"use strict";
import { pass } from "./nothing.js";

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  app.log.info("Yay, the app was loaded!");

  // On adding app to the account
  app.on("installation.created", async (context) => {
    const owner = context.payload.installation.account.login;

    for (const repo of context.payload.repositories) {
      const repoName = repo.name;

      pass();
    }
  });

  // On adding adding a repository to the app
  app.on("installation_repositories.added", async (context) => {
    const owner = context.payload.installation.account.login;

    for (const repo of context.payload.repositories_added) {
      const repoName = repo.name;

      pass();
    }
  });

  // on creating a new repository
  app.on("repository.created", async (context) => {
    const owner = context.payload.repository.owner.login;
    const repoName = context.payload.repository.name;

    pass();
  });

  // on commiting to the master branch
  app.on("push", async (context) => {
    const owner = context.payload.repository.owner.login;
    const repoName = context.payload.repository.name;

    pass();
  });
};

// /**
//  * Checks for a DOI in the README.md file of a repository
//  * @param {import('probot').Context} context
//  * @param {String} owner
//  * @param {String} repoName
//  * @returns
//  */
// const checkForDOI = async (context, owner, repoName) => {
//   try {
//     // Get the README
//     const readme = await context.octokit.rest.repos.getReadme({
//       owner,
//       repoName,
//     });

//     // Get the decoded content
//     const readmeContent = Buffer.from(readme.data.content, "base64").toString();

//     // Check if a doi is present in the readme
//     const doiRegex = /10.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
//     const doi = doiRegex.exec(readmeContent);

//     /**
//      * !TODO: Check if the doi is valid
//      * Potentially use the crossref api or resolve the DOI manually
//      */

//     if (doi) {
//       console.log("DOI found");
//     } else {
//       // throw an error to trigger the catch block
//       throw new Error("DOI not found");
//     }
//   } catch (error) {
//     console.log("Opening issue...");

//     // Check if the issue already exists
//     const issue = await context.octokit.rest.issues.listForRepo({
//       owner,
//       repo: repoName,
//       state: "open",
//       creator: "doi-check-app[bot]",
//     });

//     // If the issue already exists, return
//     if (issue.data.length > 0) {
//       console.log("Issue already exists");
//       return;
//     }

//     const repoIssue = await context.octokit.rest.issues.create({
//       owner,
//       repo: repoName,
//       title: "Could not find a DOI in the README",
//       body: ISSUE_MESSAGE,
//     });

//     return repoIssue;
//   }
// };
