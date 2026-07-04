#!/usr/bin/env python3
"""pgm board — thin shim. Delegates to the shared pgm engine, pointed at THIS
folder. The engine is single-source (canonical: pgm-master/pgm_engine.py,
installed at ~/.pgm/pgm_engine.py); this shim is the only pgm file per project
that stays tiny + copyable. Run: `python3 pgm/board.py [cmd] [args]`.
"""
import os, sys, runpy, pathlib

os.environ["PGM_DIR"] = str(pathlib.Path(__file__).resolve().parent)
engine = os.environ.get("PGM_ENGINE") or str(pathlib.Path.home() / ".pgm" / "pgm_engine.py")
if not pathlib.Path(engine).exists():
    sys.exit(
        f"pgm engine not found: {engine}\n"
        "Install once:  ln -s /path/to/pgm-master/pgm_engine.py ~/.pgm/pgm_engine.py\n"
        "or set $PGM_ENGINE to its location."
    )
runpy.run_path(engine, run_name="__main__")
