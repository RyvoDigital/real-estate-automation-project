#!/usr/bin/env bash
# Would committing right now DELETE anything from a doc?
#
#   ./tests/docs_guard.sh            # docs/ plus the two READMEs
#   ./tests/docs_guard.sh docs src   # any paths you like
#
# WHY THIS EXISTS (engineering-lessons.md §9b)
# On 2026-09-16 four paragraphs vanished from
# docs/improvements-and-opportunities.md inside a commit whose message
# described adding something else. They had been staged with `hash-object` +
# `update-index` and never written to the working tree, so the index held them
# and the file on disk did not. A later ordinary `git add` of that file staged
# the disk version and deleted all four. Nothing failed, nothing warned, and
# the loss surfaced an hour later only because an anchor could not be found.
#
# These files are append-mostly. A removal is not always wrong -- a correction
# replaces a stale sentence, and that is healthy -- but it is always worth a
# human saying "yes, I did that" before it is committed. This prints exactly
# what would be lost so that answer takes five seconds.
#
# Two comparisons, because they catch different faults:
#   INDEX vs DISK  content staged but absent from the file. This is ALWAYS a
#                  bug: the next plain `git add` reverts it silently.
#   HEAD  vs DISK  content committed but absent from the file. This is the
#                  loss as it would land, whether the cause was staging
#                  trickery, a bad merge, or an editor writing a stale buffer.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || { echo "not in a git repository" >&2; exit 2; }

PATHS=("$@")
if [[ ${#PATHS[@]} -eq 0 ]]; then
  PATHS=(docs README.md src/README.md tests/README.md)
fi

# Lines a diff would REMOVE, ignoring the ---/+++ headers.
removed() { git diff "$@" | grep -E '^-[^-]' || true; }

rc=0

# --- 1. the trap itself: staged but not on disk -------------------------------
INDEX_LOSS="$(removed -- "${PATHS[@]}")"
if [[ -n "${INDEX_LOSS}" ]]; then
  # Unstaged edits of your own also land here, so it is reported as a question
  # rather than an accusation -- but if you did NOT delete these lines, the
  # index is ahead of the file and something staged them behind your back.
  echo "⚠  the working tree LACKS content that is currently staged:"
  echo
  git diff --numstat -- "${PATHS[@]}" | awk '$1 ~ /^[0-9]+$/ && $2 > 0 { printf "   %-52s %s line(s) would be lost\n", $3, $2 }'
  echo
  echo "${INDEX_LOSS}" | head -40 | sed 's/^/   /'
  [[ "$(echo "${INDEX_LOSS}" | wc -l)" -gt 40 ]] && echo "   … $(( $(echo "${INDEX_LOSS}" | wc -l) - 40 )) more"
  echo
  echo "   If you did not delete these yourself, DO NOT run 'git add' on these files."
  echo "   Recover with:  git checkout -p -- <file>     (or: git show :0:<file> > <file>)"
  echo
  rc=1
fi

# --- 2. the loss as it would land: committed but not on disk ------------------
HEAD_LOSS="$(removed HEAD -- "${PATHS[@]}")"
if [[ -n "${HEAD_LOSS}" ]]; then
  echo "⚠  committing the working tree would REMOVE content that is in HEAD:"
  echo
  # numstat is ADDED <tab> DELETED <tab> PATH, so deletions are field 2 in both
  # blocks. Reading field 1 here printed nothing at all on the first run -- a
  # summary line that silently renders empty is its own small §9b.
  git diff --numstat HEAD -- "${PATHS[@]}" | awk '$2 ~ /^[0-9]+$/ && $2 > 0 { printf "   %-52s -%s +%s\n", $3, $2, $1 }'
  echo
  echo "${HEAD_LOSS}" | head -40 | sed 's/^/   /'
  [[ "$(echo "${HEAD_LOSS}" | wc -l)" -gt 40 ]] && echo "   … $(( $(echo "${HEAD_LOSS}" | wc -l) - 40 )) more"
  echo
  echo "   Every line above disappears if you commit now. Intended corrections are fine;"
  echo "   anything you do not recognise is the §9b failure and should be recovered:"
  echo "     git show HEAD:<file> > <file>          # take HEAD's copy back"
  echo "     git log -S'<a phrase you wrote>' -- <file>   # when did it leave?"
  echo
  rc=1
fi

if [[ ${rc} -eq 0 ]]; then
  echo "✓ no documentation would be lost by committing (${PATHS[*]})"
fi
exit "${rc}"
