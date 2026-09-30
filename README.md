# Garmin → Dawarich Sync

A small Dockerized service that:
- logs into Garmin Connect, including MFA and protected against ban to too many requests;
- stores Garmin OAuth tokens in a persistent volume;
- imports all existing Garmin activities on the first sync, 10 activities per page;
- downloads each activity as GPX with a configurable delay;
- uploads GPX directly to Dawarich `POST /api/v1/imports`;
- remembers successfully imported Garmin activity IDs;
- performs an incremental daily sync;
- exposes a small web UI on port 8080.

## Run

```bash
docker run -d \
  -p 8080:8080 \
  -v "$(pwd)/data:/data" \
  marucjmar/garmin-dawarich-sync:latest
```

Open:

http://localhost:8080

For Portainer etc:

```yml
services:
  garmin-dawarich-sync:
    image: marucjmar/garmin-dawarich-sync:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      SERVER_ENABLED: "true"
    volumes:
      - ./data:/data
```

## Configure

Enter:
- Garmin email
- Garmin password
- MFA code if Garmin requests it
- Dawarich URL, e.g. `https://dawarich.example.com`
- Dawarich API key

The credentials are used for the initial Garmin login. The Garmin password is not stored in `state.json`; only the OAuth token files are persisted.

## First sync

Click "Sync now" or wait for the daily schedule.

The initial sync:
1. requests Garmin activities in pages of 10;
2. downloads GPX files one by one;
3. waits between requests;
4. uploads each GPX to Dawarich;
5. records the Garmin activity ID only after a successful Dawarich response;
6. continues until Garmin returns no more activities.

If the container is restarted, completed activities remain in `/data/state.json`.

## Daily sync

The daily job fetches the newest 10 Garmin activities and uploads only IDs that are not already in the local state.

## Configuration environment variables

- `BATCH_SIZE` default `10`
- `REQUEST_DELAY_MS` default `5000`
- `DAWARICH_DELAY_MS` default `3000`
- `SYNC_HOUR` default `3`
- `SYNC_MINUTE` default `17`

## Security

Do not expose port 8080 directly to the Internet without authentication/reverse proxy protection. The setup page handles sensitive credentials.

The app binds to `0.0.0.0` inside the container so Portainer/Docker port publishing can expose it.

## Notes

Dawarich imports GPX asynchronously. A successful HTTP response means the file was accepted/queued; the subsequent processing happens in Dawarich.

This project intentionally keeps Garmin OAuth token files and sync state on a persistent host-mounted volume.
