/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/* eslint-disable no-console */

/*
 * This script executes post build operations.
 */

const fs = require("fs");
const DIST_ASSETS_PATH = "./dist";
const UI_CONTENTS_PATH = "../ui/content";

// Remove the previous contents from the '<pkg>/ui/content' folder
if (fs.existsSync(UI_CONTENTS_PATH)) {
  fs.rmSync(UI_CONTENTS_PATH, { recursive: true }, (err) => {
    if (err) {
      console.log(
        "Failed to remove the previous assets from ",
        UI_CONTENTS_PATH,
        ": ",
        err
      );
    } else {
      console.log("Removed the previous assets from ", UI_CONTENTS_PATH, "");
    }
  });
} else {
  // Create directory if it doesn't exist yet
  fs.mkdirSync(UI_CONTENTS_PATH, { recursive: true });
}

// Copy the new bundled dist to the '<pkg>/ui/content' folder
fs.cp(DIST_ASSETS_PATH, UI_CONTENTS_PATH, { recursive: true }, (err) => {
  if (err) {
    console.log(
      "Failed to copy the new bundled dist folder to ",
      UI_CONTENTS_PATH,
      ": ",
      err
    );
  } else {
    console.log("Copied the new bundled dist folder to ", UI_CONTENTS_PATH, "");
  }
});
