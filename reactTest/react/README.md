# Code Generation Development

## Setup

First create a .env file in the react/ folder with the following fields:
```
VITE_C3_ENV=<env_name>
VITE_C3_APP=<app_name>
VITE_C3_URL=<cluster_url>
VITE_C3_AUTH_TOKEN=<auth_token>
```

The env and app name are the env and app you created on a cluster like c3 dev. For <app_name> you will most likely use codinator.\
The cluster url is the base url of the cluster your env and app are on. This may be https://gkev8dev.c3dev.cloud/ if you are on c3 dev.\
The auth token you can get from going to static console, and running:
```js
Authenticator.generateActionAuthToken()
```
Copy and paste the returned token in place of <auth_token>.

You can refer to the .env.sample file in the react/ folder as as reference.

## Available Scripts

From the react/ directory, you can run:

### `npm run dev`

Runs the app in the development mode.\
Open [http://localhost:8000](http://localhost:8000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner with code coverage results.

### `npm run build`

Builds the app for production to the `ui` folder at the package root level.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Syncing this `ui` folder will allow you to access the ui on the env + app you sync to.\
This is the same build that the github action will create when deploying a new version of codinator.

Make sure to run `npm run build` after making any ui changes and fix any errors that appear prior to pushing your changes.\
The UI may work despite the errors, but the build during deployment will not succeed.

## JSON Server Deployment

To use a fake backend server during development, make sure to download `json-server`.\
This server is run in a separate terminal from `npm run dev` which only serves the frontend UI.\
Using this server allows you to not have to make calls to the actual c3 server and also allows
for testing specific responses from the server in the UI.\
The server returns the fake data stored in db.json instead of making a call to the c3 server, so
the db.json file must be configured for each new c3 server api you want to test.

```sh
npm install -g json-server
```

Use `json-server` to watch the `db.json` file in this directory.

```sh
json-server --watch db.json --routes routes.json --port 8888 --middlewares json-server.ts
```

## Typical Development Flow

Most likely you can run `npm run dev` while making changes to the UI to see the updates happen in real time to the UI at http://localhost:8000 .\
Simultaneously, you can run the JSON server in a different terminal to emulate the backend server. This is optional and is useful if you don't
want to make calls to the actual c3 server or want to test specific responses from the server.\
Once you are done with your changes, you can run `npm run build` to ensure there are no errors and that a build is successful.\
Then you can push your changes.
