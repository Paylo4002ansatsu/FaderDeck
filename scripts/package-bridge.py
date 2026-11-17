#!/usr/bin/env python3
"""Build the standalone FaderDeck bridge archive used by the local panel."""

from pathlib import Path
import os
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CLIENT_DIR = ROOT / "client"
OUTPUT = CLIENT_DIR / "downloads" / "fader-bridge.zip"
REQUIRED_FILES = (
    ROOT / "server.cjs",
    ROOT / "server-utils.cjs",
    ROOT / "fader-bridge" / "package.json",
    ROOT / "fader-bridge" / "package-lock.json",
    ROOT / "README-ponte.md",
    CLIENT_DIR / "index.html",
)


def add_file(archive: zipfile.ZipFile, source: Path, archive_name: str) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"Arquivo necessário ao pacote não encontrado: {source}")
    archive.write(source, archive_name)


def build_archive() -> None:
    missing = [str(path.relative_to(ROOT)) for path in REQUIRED_FILES if not path.is_file()]
    if missing:
        raise FileNotFoundError("Arquivos necessários ausentes: " + ", ".join(missing))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix="fader-bridge-", suffix=".zip", dir=OUTPUT.parent)
    os.close(handle)
    temporary_path = Path(temporary_name)

    try:
        with zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            add_file(archive, ROOT / "server.cjs", "server.cjs")
            add_file(archive, ROOT / "server-utils.cjs", "server-utils.cjs")
            add_file(archive, ROOT / "fader-bridge" / "package.json", "package.json")
            add_file(archive, ROOT / "fader-bridge" / "package-lock.json", "package-lock.json")
            add_file(archive, ROOT / "README-ponte.md", "README.md")

            for source in sorted(CLIENT_DIR.rglob("*")):
                if not source.is_file():
                    continue
                relative = source.relative_to(CLIENT_DIR)
                if relative.parts[0] == "downloads":
                    continue
                if source.name == ".DS_Store":
                    continue
                archive.write(source, Path("client") / relative)

        with zipfile.ZipFile(temporary_path, "r") as archive:
            corrupt_entry = archive.testzip()
            if corrupt_entry:
                raise zipfile.BadZipFile(f"Entrada corrompida no pacote: {corrupt_entry}")
            names = set(archive.namelist())
            required_entries = {"client/index.html", "server.cjs", "server-utils.cjs", "package.json", "package-lock.json", "README.md"}
            missing_entries = sorted(required_entries - names)
            if missing_entries:
                raise zipfile.BadZipFile("Entradas ausentes no pacote: " + ", ".join(missing_entries))

        os.replace(temporary_path, OUTPUT)
        os.chmod(OUTPUT, 0o644)
    finally:
        temporary_path.unlink(missing_ok=True)

    with zipfile.ZipFile(OUTPUT, "r") as archive:
        entry_count = len(archive.namelist())
    print(f"Pacote criado: {OUTPUT}")
    print(f"Entradas: {entry_count}")


if __name__ == "__main__":
    build_archive()
