#!/usr/bin/env sh

# Determine which Python version to use
if command -v python3.10 &>/dev/null; then
    PYTHON_VERSION="python3.10"
else
    PYTHON_VERSION="python3"
fi

# Execute yt-dlp with the chosen Python version
exec ${PYTHON:-$PYTHON_VERSION} -Werror -Xdev "$(dirname "$(realpath "$0")")/yt_dlp/__main__.py" "$@"
