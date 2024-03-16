#!/usr/bin/env sh
if command -v python3.10 &>/dev/null; then
    exec ${PYTHON:-python3.10} -Werror -Xdev "$(dirname "$(realpath "$0")")/yt_dlp/__main__.py" "$@"
else
    exec ${PYTHON:-python3} -Werror -Xdev "$(dirname "$(realpath "$0")")/yt_dlp/__main__.py" "$@"
fi