"""Shared string-hygiene pass for any human-entered text coming out of ESPN (team names,
player names, ...). NFKC normalize, strip control/zero-width/bidi-override chars and HTML tags,
collapse whitespace, cap length. Emoji and punctuation are deliberately preserved (existing team
names use both)."""

import re
import unicodedata

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_HTML_TAGS = re.compile(r"<[^>]+>")
_WHITESPACE = re.compile(r"\s+")
_MAX_NAME_LENGTH = 100

# Zero-width spaces/joiners (U+200B-U+200F) and bidi-override controls
# (U+202A-U+202E) — spelled out as codepoints rather than literal characters
# so the source stays readable instead of hiding invisible glyphs inline.
_INVISIBLE_CODEPOINTS = frozenset([*range(0x200B, 0x2010), *range(0x202A, 0x202F)])


def sanitize_name(raw: str | None) -> str:
    if not raw:
        return ""
    value = unicodedata.normalize("NFKC", raw)
    value = "".join(ch for ch in value if ord(ch) not in _INVISIBLE_CODEPOINTS)
    value = _CONTROL_CHARS.sub("", value)
    value = _HTML_TAGS.sub("", value)
    value = _WHITESPACE.sub(" ", value).strip()
    return value[:_MAX_NAME_LENGTH]
