#!/bin/zsh
set -e
PATCH="$1"
MSG="$2"
cp ~/Downloads/"$PATCH" .
git pull
git apply "$PATCH"
git rm "$PATCH"
git add -A
git commit -m "$MSG"
git push
echo "Done - pushed to GitHub."
