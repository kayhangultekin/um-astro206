#!/bin/sh
# Build the ASTRO 206 lecture notes.
#
#   ./render.sh students              public build: empty stubs, exactly what CI/Pages sees
#   ./render.sh me                    instructor build: real in-class problems (PDF + HTML)
#   ./render.sh me special-relativity build only one lecture
#
# All this does is point the `in_class` symlink at the instructor tree or the
# committed stubs, then render. It prints which way the symlink points so you
# always know what you just built.
#
# The instructor tree lives OUTSIDE this repository, at ../for_me, so its
# contents can never be committed here. The committed value of the symlink must
# stay `for_students` — a fresh clone with a dangling link fails the build
# outright, including the student HTML. Run once per clone, after the first
# commit, so local flips are invisible to git:
#
#     git update-index --skip-worktree in_class
#
set -e
cd "$(dirname "$0")"

INSTRUCTOR_TREE=../for_me

case "$1" in
  me)
    if [ ! -d "$INSTRUCTOR_TREE" ]; then
      echo "error: instructor tree not found at $INSTRUCTOR_TREE" >&2
      exit 1
    fi
    ln -sfn "$INSTRUCTOR_TREE" in_class
    ;;
  students) ln -sfn for_students in_class ;;
  "")       echo "usage: $0 {me|students} [lecture-slug]" >&2; exit 2 ;;
  *)        echo "unknown target '$1' (expected 'me' or 'students')" >&2; exit 2 ;;
esac

echo "in_class -> $(readlink in_class)"

if [ -n "$2" ]; then
  target="lectures/$2"
  if [ ! -d "$target" ]; then
    echo "error: no such lecture '$target'" >&2
    exit 1
  fi
  quarto render "$target"
else
  quarto render
fi

echo
echo "Built with in_class -> $(readlink in_class)"
[ "$(readlink in_class)" = "$INSTRUCTOR_TREE" ] && \
  echo "NOTE: this HTML was built from the instructor tree. Do not publish it."
exit 0
