import argparse

import cv2

from ..flags import Flags
from ..inference.detector import Detector
from ..settings import PERSONS_DIR, VIDEOS_DIR


def main():
    parser = argparse.ArgumentParser(description="Save the largest people in a video frame as watchlist crops.")
    parser.add_argument("video", help="file name inside data/videos, e.g. cam1.mp4")
    parser.add_argument("--at", type=float, default=5.0, help="timestamp in seconds")
    parser.add_argument("--count", type=int, default=3)
    args = parser.parse_args()

    cap = cv2.VideoCapture(str(VIDEOS_DIR / args.video))
    cap.set(cv2.CAP_PROP_POS_MSEC, args.at * 1000)
    ok, image = cap.read()
    if not ok:
        raise SystemExit("could not read that frame")
    boxes = Detector(Flags(person_only=True, vectorized_boxes=True)).detect([image])[0]
    boxes = sorted(boxes, key=lambda b: (b[3] - b[1]) * (b[2] - b[0]), reverse=True)[:args.count]
    stem = args.video.rsplit(".", 1)[0]
    for i, (x1, y1, x2, y2, _) in enumerate(boxes):
        path = PERSONS_DIR / f"{stem}_{int(args.at)}s_{i}.jpg"
        cv2.imwrite(str(path), image[int(y1):int(y2), int(x1):int(x2)])
        print(path)


if __name__ == "__main__":
    main()
