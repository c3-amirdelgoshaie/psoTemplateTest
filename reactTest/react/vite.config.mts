/*
 * Copyright 2009-2025 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";
import eslint from "vite-plugin-eslint2";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_C3_");
  const baseUrl = env.VITE_C3_URL || "http://localhost:8888";

  if (mode === "development") {
    assertEnvVariablesConfigured(env);
  }

  return {
    plugins: [
      tailwindcss(),
      react(),
      // Single eslint2 instance with valid options
      eslint({
        lintOnStart: true,
        include: ["src/**/*.{ts,tsx,js,jsx}"],
        lintInWorker: true,        // non-blocking, no overlay
        emitErrorAsWarning: true,  // don't fail on errors
        emitWarning: true,         // show warnings
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@/shared": path.resolve(__dirname, "./resources/examples/shared"),
      },
    },
    server: {
      port: 8000,
      proxy: {
        "^/api": `${baseUrl}/${env.VITE_C3_ENV}/${env.VITE_C3_APP}/`,
        "^/remote": `${baseUrl}/${env.VITE_C3_ENV}/${env.VITE_C3_APP}/`,
        "^/thirdparty": `${baseUrl}/${env.VITE_C3_ENV}/${env.VITE_C3_APP}/`,
        "^/typesys": `${baseUrl}/${env.VITE_C3_ENV}/${env.VITE_C3_APP}/`,
      },
    },
    base: "./",
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          assetFileNames: "assets/[name][extname]",
          chunkFileNames: "assets/[name].js",
          entryFileNames: "assets/[name].js",
        },
        onwarn: (warning, warn) => {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          warn(warning);
        },
      },
    },
  };
});

// keep as plain function so TS infers any for env entries coming from loadEnv
function assertEnvVariablesConfigured(env: Record<string, string>) {
  const isEnvProvided = env.VITE_C3_ENV && env.VITE_C3_ENV !== "";
  const isAppProvided = env.VITE_C3_APP && env.VITE_C3_APP !== "";
  if (!isEnvProvided || !isAppProvided) {
    const errorMessage =
      "\n\n" +
      "Please create a .env file and set the VITE_C3_ENV and VITE_C3_APP env variables. E.g:\n" +
      "  VITE_C3_ENV=c3\n" +
      "  VITE_C3_APP=c3\n\n" +
      "If you need to connect to a remote environment, make sure to also specify the VITE_C3_URL and VITE_C3_AUTH_TOKEN env variables. E.g:\n" +
      "  VITE_C3_URL=https://cluster.url\n" +
      "  VITE_C3_AUTH_TOKEN=<your token>\n";
    throw Error(errorMessage);
  }
}
