#!/usr/bin/env python3
"""Sample a local video for cover selection. Requires existing ffmpeg/ffprobe."""

import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys


def run(command):
    return subprocess.run(
        command, check=True, capture_output=True, text=True, timeout=120
    ).stdout


def positive_count(value):
    count = int(value)
    if not 1 <= count <= 24:
        raise argparse.ArgumentTypeError("count must be between 1 and 24")
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--out-dir", type=Path, required=True,
                        help="New directory; existing paths are never overwritten")
    samples = parser.add_mutually_exclusive_group()
    samples.add_argument("--count", type=positive_count, default=8)
    samples.add_argument("--times", type=float, nargs="+",
                         help="Sample positions in seconds, in requested order")
    args = parser.parse_args()

    try:
        for program in ("ffmpeg", "ffprobe"):
            if not shutil.which(program):
                raise ValueError(f"Required tool is not installed: {program}")
        source = args.video.expanduser().resolve(strict=True)
        if not source.is_file():
            raise ValueError("Input must be a video file")
        destination = args.out_dir.expanduser().absolute()
        if destination.exists() or destination.is_symlink():
            raise ValueError("Output path already exists; choose a new directory")
        probe = json.loads(run([
            "ffprobe", "-v", "error", "-show_streams", "-show_format",
            "-of", "json", str(source),
        ]))
        streams = [stream for stream in probe.get("streams", [])
                   if stream.get("codec_type") == "video"
                   and not stream.get("disposition", {}).get("attached_pic")]
        if not streams:
            raise ValueError("Input has no playable video stream")
        stream = streams[0]
        duration = None
        for value in (stream.get("duration"), probe.get("format", {}).get("duration")):
            try:
                candidate = float(value)
            except (TypeError, ValueError):
                continue
            if math.isfinite(candidate) and candidate > 0:
                duration = candidate
                break
        if duration is None:
            raise ValueError("Could not determine a positive finite video duration")
        times = args.times if args.times is not None else [
            duration * (index + 0.5) / args.count for index in range(args.count)
        ]
        if len(times) > 24 or any(
            not math.isfinite(point) or not 0 <= point < duration for point in times
        ):
            raise ValueError("Use 1–24 finite sample times within [0, video duration)")

        destination.mkdir(parents=True, exist_ok=False)
        frames = []
        for index, point in enumerate(times, start=1):
            name = f"frame-{index:02d}.jpg"
            target = destination / name
            run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
                "-ss", f"{point:.9f}", "-i", str(source),
                "-map", f"0:{stream['index']}", "-frames:v", "1",
                "-q:v", "2", "-update", "1", str(target),
            ])
            if not target.is_file() or target.stat().st_size == 0:
                raise ValueError(f"No frame decoded at {point:.3f}s; try earlier times")
            frames.append({"file": name, "requested_time_seconds": point})

        columns = min(4, len(frames))
        rows = math.ceil(len(frames) / columns)
        # Normalize sample aspect ratio for the preview; originals stay untouched.
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
            "-framerate", "1", "-start_number", "1",
            "-i", str(destination / "frame-%02d.jpg"), "-vf",
            "scale=iw*sar:ih,setsar=1,"
            "scale=320:240:force_original_aspect_ratio=decrease,"
            "pad=320:240:(ow-iw)/2:(oh-ih)/2,"
            f"tile={columns}x{rows}:nb_frames={len(frames)}:padding=8:margin=8",
            "-frames:v", "1", "-q:v", "2", "-update", "1",
            str(destination / "contact-sheet.jpg"),
        ])
        manifest = {
            "source": str(source), "duration_seconds": duration,
            "stream_index": stream["index"],
            "coded_width": stream.get("width"), "coded_height": stream.get("height"),
            "rotation_metadata": {
                "tag_rotation": stream.get("tags", {}).get("rotate"),
                "display_rotation_degrees": [
                    data["rotation"] for data in stream.get("side_data_list", [])
                    if "rotation" in data
                ],
            },
            "frames": frames, "contact_sheet": "contact-sheet.jpg",
            "sheet_columns": columns,
            "note": "Requested seek positions, not frame-accurate timecodes. "
                    "Inspect actual frames before choosing a cover.",
        }
        (destination / "frames.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Sampled {len(frames)} frames: {destination / 'frames.json'}")
        return 0
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        detail = error.stderr.strip() if isinstance(error, subprocess.CalledProcessError) else str(error)
        print(f"Sampling failed: {detail}", file=sys.stderr)
        print("Any partial output is preserved; retry in a new directory.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
