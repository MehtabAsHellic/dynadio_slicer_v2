"""Run the local API server: ``dynadio-api``."""

from __future__ import annotations

import argparse
import threading
import webbrowser

import uvicorn


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="dynadio-api", description="DynaDio local API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", help="open the app in a browser")
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args(argv)
    url = f"http://{args.host}:{args.port}/"
    if args.open:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    if args.reload:
        uvicorn.run("dynadio_api.app:app", host=args.host, port=args.port, reload=True)
    else:
        uvicorn.run("dynadio_api.app:app", host=args.host, port=args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
