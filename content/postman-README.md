# Graceful Fail API — Postman Collection

## Importing the Collection

1. Open Postman (desktop app or web).
2. Click **Import** in the top-left corner.
3. Drag and drop `graceful-fail.postman_collection.json` into the import dialog, or click **Upload Files** and select it.
4. The collection "Graceful Fail API (selfheal.dev)" will appear in your sidebar.

## Setting Up Your API Key

The collection ships with a placeholder API key (`gf_your_api_key`). Replace it with your real key:

1. Click on the collection name in the sidebar.
2. Go to the **Variables** tab.
3. Find the `api_key` variable and replace the value with your actual Graceful Fail API key (starts with `gf_`).
4. Click **Save**.

All requests in the collection reference `{{api_key}}` automatically, so you only need to set it once.

## Collection Structure

| Folder | Purpose |
|--------|---------|
| **Quick Start** | Basic proxy examples (GET, POST, custom headers) |
| **Error Scenarios** | Requests that trigger 404, 422, 429, and 500 errors to demonstrate error interception |
| **Utilities** | Fetch the OpenAPI spec (no auth required) |

## How It Works

Every proxy request is a `POST` to `{{base_url}}/api/proxy`. The destination URL and HTTP method are specified via headers:

- `X-Destination-URL` — The full URL of the API you want to call.
- `X-Destination-Method` — The HTTP method to use at the destination (GET, POST, PUT, PATCH, DELETE).
- `Authorization` — Your Graceful Fail API key as a Bearer token.

When the destination returns a 4xx or 5xx error, Graceful Fail intercepts it and returns an `error_analysis` object with actionable fix suggestions.

## Base URL

The default `base_url` variable is set to `https://selfheal.dev`. Change it in the collection variables if you are running a local or staging instance.
