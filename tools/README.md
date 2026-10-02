# tools

Standalone helper scripts. Not part of the Anki add-on — run them directly with
Python 3; they use the standard library only.

## yt_playlist_mv.py

Maps a YouTube Music playlist to each track's official music video.

```sh
export YT_API_KEY=...        # YouTube Data API v3 key
python3 tools/yt_playlist_mv.py "https://music.youtube.com/playlist?list=PL..." \
    --csv playlist_mv.csv --markdown playlist_mv.md
```

Options:

| flag | meaning |
| --- | --- |
| `--csv PATH` / `--markdown PATH` | output paths (pass an empty string to skip one) |
| `--cache PATH` | resolved searches, reused on later runs so they cost no quota |
| `--max N` | stop after N uncached searches, then write what it has |
| `--no-search` | list the playlist only, no MV lookup |

Notes:

- **Quota**: `search.list` costs 100 units per track and the default daily quota
  is 10,000, so about 100 new tracks per day. Use `--max` to pace a long
  playlist; the cache makes resuming free.
- **Private playlists** are not readable with an API key alone. Set the playlist
  to Unlisted, or switch the script to OAuth.
- Matches are scored on title similarity, official-video markers and channel
  name. Rows marked `⚠️` (`confident=no` in the CSV) scored low and are worth
  checking by hand.
