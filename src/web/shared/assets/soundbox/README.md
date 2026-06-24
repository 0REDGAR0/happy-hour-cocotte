# Soundbox assets

The `/bar` soundbox now acts as a remote control for the Android / TV overlay
through `POST /api/soundbox/play` and `soundboxEvent` in `/api/state`.

Do not add fake audio files here. Final playback is expected on the Android
overlay side using event types `horn`, `whistle`, `cheer`, and `goal`.
