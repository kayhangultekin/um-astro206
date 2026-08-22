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
# AFTER A `me` BUILD the PDFs are copied somewhere you can actually find them,
# named `lecNN-<slug>.pdf` so they sort in teaching order — every lecture's
# build output is otherwise called `index.pdf`. The destination comes from
# $ASTRO206_PDF_DEST, or failing that the first non-comment line of
# ../for_me/pdf-destination. With neither set this script copies nothing and
# says nothing, so a fresh clone and anyone who is not Kayhan are unaffected.
# The path lives in for_me/ and not here because THIS FILE IS PUBLIC.
#
# The copy is guarded on mtime, and that guard is the whole point rather than
# belt-and-braces: _site/ is shared mutable state. A `quarto preview` session
# rewrites files there behind this script's back, and a single-lecture render
# leaves every OTHER lecture's PDF untouched — possibly a student build from
# hours ago. So "an index.pdf exists" is not evidence of anything, and only
# files this run actually wrote are copied. See PLAYBOOK.md.
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

# Freshness reference for the copy step below. Anything not newer than this
# was not built by this run. Created before the render, removed on any exit.
stamp=$(mktemp)
trap 'rm -f "$stamp"' EXIT

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

# ---------------------------------------------------------------------------
# Copy the instructor PDFs out to somewhere printable.
#
# Everything here warns and continues; nothing fails the build. The render has
# already succeeded by this point, and the exit status should keep meaning
# "the build worked" rather than "the build worked and Dropbox was mounted".
# ---------------------------------------------------------------------------
copy_pdfs() {
  # Instructor builds only. A student PDF has no answers in it and has no
  # business in the folder Kayhan prints from.
  [ "$(readlink in_class)" = "$INSTRUCTOR_TREE" ] || return 0

  # `|| true` because a plain assignment from a failed command substitution
  # trips `set -e`. Strips comments and blank lines, takes the first line left.
  dest="${ASTRO206_PDF_DEST:-$(sed -e 's/#.*//' -e '/^[[:space:]]*$/d' \
        "$INSTRUCTOR_TREE/pdf-destination" 2>/dev/null | head -1 || true)}"
  [ -n "$dest" ] || return 0

  # Refuse to invent a tree. A missing PARENT means the wrong machine or an
  # unsynced Dropbox, and silently creating it there would be worse than not
  # copying: the files would look filed away while being nowhere.
  parent=$(dirname "$dest")
  if [ ! -d "$parent" ]; then
    echo "warning: PDF destination's parent does not exist, nothing copied:" >&2
    echo "         $parent" >&2
    return 0
  fi
  mkdir -p "$dest"

  # Only the lectures this run rendered. Capture the mode FIRST: `set --`
  # below replaces the positional parameters, so $2 is gone after it runs.
  one_lecture=$2
  if [ -n "$one_lecture" ]; then set -- "lectures/$one_lecture"; else set -- lectures/*/; fi

  echo
  copied=0
  for dir in "$@"; do
    dir=${dir%/}
    slug=$(basename "$dir")
    pdf="_site/$dir/index.pdf"

    if [ ! -f "$pdf" ]; then
      echo "warning: no PDF for '$slug' — not copied" >&2
      continue
    fi
    # THE GUARD. Older than the stamp means some earlier build or a preview
    # session wrote it, not us, and we have no idea which tree it came from.
    if [ ! "$pdf" -nt "$stamp" ]; then
      echo "warning: '$slug' PDF predates this build — not copied (stale)" >&2
      continue
    fi

    # Lecture number from the document's own frontmatter. That subtitle is
    # load-bearing already: the PDF running head prints it via \@subtitle.
    num=$(sed -n 's/^subtitle:.*Lecture \([0-9][0-9]*\).*/\1/p' "$dir/index.qmd" \
          | head -1)
    if [ -n "$num" ]; then
      name=$(printf 'lec%02d-%s.pdf' "$num" "$slug")
    else
      echo "warning: no 'Lecture N' in $slug's subtitle — filing it unnumbered" >&2
      name="lec--$slug.pdf"
    fi

    cp "$pdf" "$dest/$name"
    echo "  copied  $name"
    copied=$((copied + 1))
  done
  echo "$copied PDF(s) -> $dest"

  # After a FULL build only, every lecture was just written, so anything else
  # matching the pattern is an orphan — usually the old name after a slug
  # rename. Reported, never deleted: this directory is Kayhan's, not ours.
  if [ -z "$one_lecture" ]; then
    for old in "$dest"/lec*.pdf; do
      [ -e "$old" ] || continue
      if [ "$old" -nt "$stamp" ]; then continue; fi
      echo "note: '$(basename "$old")' was not written by this build — stale?" >&2
    done
  fi
}
copy_pdfs "$@"

echo
echo "Built with in_class -> $(readlink in_class)"
[ "$(readlink in_class)" = "$INSTRUCTOR_TREE" ] && \
  echo "NOTE: this HTML was built from the instructor tree. Do not publish it."
exit 0
