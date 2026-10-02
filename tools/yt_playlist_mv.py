#!/usr/bin/env python3
"""Map a YouTube Music playlist to each track's official music video.

Reads a playlist with the YouTube Data API v3, then searches for the official
music video of every track and writes the pairing to CSV and/or Markdown.

Usage:
    export YT_API_KEY=...
    python3 tools/yt_playlist_mv.py <playlist-url-or-id> [options]

Quota warning: each track costs one search.list call = 100 quota units, and the
default daily quota is 10,000 units (~100 tracks per day). Results are cached in
--cache so re-runs and resumes are free; use --max to cap a single run.
"""

from __future__ import annotations

import argparse
import csv
import difflib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://www.googleapis.com/youtube/v3/"

# Markers of a real music video, and of the things that merely look like one.
OFFICIAL_MARKERS = (
    "official music video", "official video", "official mv",
    "music video", "mv", "official hd video",
)
NEGATIVE_MARKERS = (
    "lyric", "lyrics", "audio", "visualizer", "cover", "karaoke", "instrumental",
    "live", "concert", "performance", "sped up", "slowed", "reverb", "8d",
    "remix", "teaser", "trailer", "reaction", "behind the scenes", "making of",
    "dance practice", "tutorial", "1 hour", "loop",
)


class ApiError(RuntimeError):
    pass


def api_get(endpoint: str, key: str, **params: str) -> dict:
    params["key"] = key
    url = API + endpoint + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        try:
            message = json.loads(body)["error"]["message"]
        except Exception:
            message = body[:500]
        raise ApiError(f"{endpoint} failed ({exc.code}): {message}") from exc


def parse_playlist_id(value: str) -> str:
    """Accept a bare id, or any youtube.com / music.youtube.com playlist URL."""
    if "/" not in value and "?" not in value:
        return value
    query = urllib.parse.urlparse(value).query
    ids = urllib.parse.parse_qs(query).get("list")
    if not ids:
        raise SystemExit(f"no `list` parameter in URL: {value}")
    return ids[0]


def fetch_playlist_title(playlist_id: str, key: str) -> str:
    data = api_get("playlists", key, part="snippet", id=playlist_id, maxResults="1")
    items = data.get("items") or []
    return items[0]["snippet"]["title"] if items else playlist_id


def fetch_tracks(playlist_id: str, key: str) -> list[dict]:
    """Return every playable item in the playlist, following pagination."""
    tracks: list[dict] = []
    page_token = None
    while True:
        params = dict(part="snippet,status", playlistId=playlist_id, maxResults="50")
        if page_token:
            params["pageToken"] = page_token
        data = api_get("playlistItems", key, **params)
        for item in data.get("items", []):
            snippet = item["snippet"]
            video_id = snippet.get("resourceId", {}).get("videoId")
            privacy = item.get("status", {}).get("privacyStatus")
            if not video_id or privacy == "private":
                continue  # deleted or private entry: nothing left to identify it by
            tracks.append({
                "position": snippet.get("position", len(tracks)),
                "title": snippet.get("title", ""),
                "channel": snippet.get("videoOwnerChannelTitle", ""),
                "video_id": video_id,
            })
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return tracks


def split_artist_track(title: str, channel: str) -> tuple[str, str]:
    """Best-effort artist/track split.

    YouTube Music's auto-generated tracks carry the song in the title and the
    artist in an "<Artist> - Topic" channel. Hand-added videos usually use the
    "<Artist> - <Song>" title convention instead.
    """
    artist = re.sub(r"\s*-\s*Topic$", "", channel).strip()
    track = re.sub(r"\s*[\(\[][^)\]]*[\)\]]\s*$", "", title).strip() or title

    if not channel.endswith("- Topic"):
        for sep in (" - ", " – ", " — ", "／", " / "):
            if sep in track:
                left, right = track.split(sep, 1)
                return left.strip(), right.strip()
    return artist, track


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9一-鿿]+", " ", text.lower()).strip()


def score_candidate(candidate: dict, artist: str, track: str) -> float:
    """Rank a search hit on how likely it is to be the track's official MV."""
    title = candidate["title"].lower()
    channel = candidate["channel"].lower()
    score = 0.0

    score += 4.0 * difflib.SequenceMatcher(
        None, normalize(track), normalize(candidate["title"])
    ).ratio()

    if any(marker in title for marker in OFFICIAL_MARKERS):
        score += 2.5
    if "official" in channel or "vevo" in channel:
        score += 1.5
    if artist and normalize(artist) in normalize(candidate["channel"]):
        score += 1.5
    if artist and normalize(artist) in normalize(candidate["title"]):
        score += 0.5

    if channel.endswith("- topic"):
        score -= 2.0  # auto-generated audio-only upload, never an MV
    score -= 1.2 * sum(1 for marker in NEGATIVE_MARKERS if marker in title)
    return score


def find_music_video(artist: str, track: str, key: str) -> dict | None:
    query = " ".join(filter(None, [artist, track, "official music video"]))
    data = api_get(
        "search", key, part="snippet", q=query, type="video",
        videoCategoryId="10", maxResults="10",
    )
    candidates = [
        {
            "video_id": item["id"]["videoId"],
            "title": item["snippet"]["title"],
            "channel": item["snippet"]["channelTitle"],
        }
        for item in data.get("items", [])
        if item.get("id", {}).get("videoId")
    ]
    if not candidates:
        return None

    best = max(candidates, key=lambda c: score_candidate(c, artist, track))
    best_score = score_candidate(best, artist, track)
    best["score"] = round(best_score, 2)
    best["confident"] = best_score >= 4.5
    return best


def load_cache(path: str) -> dict:
    if not path or not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def save_cache(path: str, cache: dict) -> None:
    if path:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(cache, handle, ensure_ascii=False, indent=1)


def watch_url(video_id: str) -> str:
    return "https://www.youtube.com/watch?v=" + video_id


def write_csv(path: str, rows: list[dict]) -> None:
    fields = ["position", "artist", "track", "source_url", "mv_title",
              "mv_channel", "mv_url", "confident", "score"]
    with open(path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows({field: row.get(field, "") for field in fields} for row in rows)


def write_markdown(path: str, playlist_title: str, rows: list[dict]) -> None:
    found = sum(1 for row in rows if row["mv_url"])
    sure = sum(1 for row in rows if row["confident"] == "yes")
    lines = [
        f"# {playlist_title} — Music Video 對照表",
        "",
        f"共 {len(rows)} 首，找到 MV {found} 首（其中 {sure} 首高信心）。",
        "",
        "| # | 歌曲 | 演出者 | MV | 頻道 | 信心 |",
        "| -: | --- | --- | --- | --- | :-: |",
    ]
    for row in rows:
        mv = f"[{row['mv_title']}]({row['mv_url']})" if row["mv_url"] else "—"
        confident = {"yes": "✅", "no": "⚠️"}.get(row["confident"], "—")
        lines.append(
            f"| {row['position']} | [{row['track']}]({row['source_url']}) "
            f"| {row['artist']} | {mv} | {row['mv_channel'] or '—'} | {confident} |"
        )
    lines += ["", "⚠️ = 比對分數偏低，建議人工確認。"]
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("playlist", help="playlist URL or bare playlist id")
    parser.add_argument("--csv", default="playlist_mv.csv", help="CSV output path")
    parser.add_argument("--markdown", default="playlist_mv.md", help="Markdown output path")
    parser.add_argument("--cache", default=".yt_mv_cache.json",
                        help="cache of resolved searches, so re-runs cost no quota")
    parser.add_argument("--max", type=int, default=0,
                        help="stop after N uncached searches (quota guard)")
    parser.add_argument("--no-search", action="store_true",
                        help="only list the playlist; skip MV lookup (1 quota unit per 50)")
    args = parser.parse_args()

    key = os.environ.get("YT_API_KEY")
    if not key:
        print("YT_API_KEY is not set.", file=sys.stderr)
        return 2

    playlist_id = parse_playlist_id(args.playlist)
    try:
        playlist_title = fetch_playlist_title(playlist_id, key)
        tracks = fetch_tracks(playlist_id, key)
    except ApiError as exc:
        print(exc, file=sys.stderr)
        print("A private playlist is not readable with an API key alone; "
              "set it to Unlisted or use OAuth.", file=sys.stderr)
        return 1

    if not tracks:
        print(f"playlist {playlist_id} returned no playable items", file=sys.stderr)
        return 1
    print(f"{playlist_title}: {len(tracks)} tracks", file=sys.stderr)

    cache = load_cache(args.cache)
    searches = 0
    rows = []
    try:
        for track in tracks:
            artist, name = split_artist_track(track["title"], track["channel"])
            key_str = f"{artist}␟{name}"
            match = cache.get(key_str)

            if match is None and not args.no_search:
                if args.max and searches >= args.max:
                    print(f"--max {args.max} reached; remaining tracks left unsearched",
                          file=sys.stderr)
                    args.no_search = True
                else:
                    match = find_music_video(artist, name, key) or {}
                    cache[key_str] = match
                    searches += 1
                    print(f"  [{searches}] {artist} - {name} -> "
                          f"{match.get('title', 'NOT FOUND')}", file=sys.stderr)

            match = match or {}
            rows.append({
                "position": track["position"] + 1,
                "artist": artist,
                "track": name,
                "source_url": watch_url(track["video_id"]),
                "mv_title": match.get("title", ""),
                "mv_channel": match.get("channel", ""),
                "mv_url": watch_url(match["video_id"]) if match.get("video_id") else "",
                "confident": {True: "yes", False: "no"}.get(match.get("confident"), ""),
                "score": match.get("score", ""),
            })
    except ApiError as exc:
        print(f"{exc}\nwriting partial results", file=sys.stderr)
    finally:
        save_cache(args.cache, cache)

    if args.csv:
        write_csv(args.csv, rows)
        print(f"wrote {args.csv}", file=sys.stderr)
    if args.markdown:
        write_markdown(args.markdown, playlist_title, rows)
        print(f"wrote {args.markdown}", file=sys.stderr)
    print(f"{searches} searches used (~{searches * 100} quota units)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
