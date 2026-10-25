---
# ===========================================================================
# SPECIAL EVENT PAGE STARTER
#
# HOW TO USE
#   1. Copy this file to  src/special-events/<slug>.md
#      The file name (without .md) becomes the URL slug:
#        src/special-events/lunken-airport-days.md
#        ->  https://ke8oir.com/special-events/lunken-airport-days/
#      Use lowercase letters, digits and dashes only.
#   2. Fill in the fields below. Delete any optional field or section you
#      don't need: empty or missing sections are skipped cleanly.
#   3. (Optional) Add the event to data/events.yaml with  slug: <slug>  so it
#      also shows on the Home and Events pages and in the calendar feed.
#   4. Put photos in  src/assets/img/special-events/<slug>/  and list them
#      under `gallery`.
#   5. Run `npm run build` (or `npm start` to preview).
#
# Lines starting with # are comments. Quote any value containing a colon.
# ===========================================================================

# ---- Required -------------------------------------------------------------
title: "Event Name"

# New York local time. "YYYY-MM-DD HH:mm" (24-hour) or "YYYY-MM-DD" (all-day).
# For all-day events `end` is the LAST day, inclusive. DST is handled for you.
start: "2027-06-26 14:00"
end: "2027-06-27 17:00"       # optional

# ---- Link previews (Open Graph) -------------------------------------------
# One sentence. Shown when the page is shared on social media or in chats.
tagline: "One sentence that says what this event is."
# description: "Overrides the tagline in link previews, if you want different text."
# og_image: /assets/img/special-events/<slug>/preview.jpg   # 1200x630 works best
# og_image_alt: "Describe the preview image"
# (If you leave og_image out, the first gallery photo is used, then the site default.)

# ---- Callsign -------------------------------------------------------------
# The special event callsign, if there is one. Delete if not.
event_callsign: "W8XXX"

# ---- Where ----------------------------------------------------------------
location_name: "Name of the place"
address: "Public street address (a venue, NEVER a private home)"
# map_url: "https://..."      # overrides the automatic map link made from `address`
access: "How to find the operating position and where visitors should check in."
parking: "Where to park."

# ---- What is this event? (for the general public) -------------------------
# A string, or a list of paragraphs. Assume the reader has never heard of
# ham radio, and explain any jargon the first time it appears.
explainer:
  - "First paragraph: what this event celebrates or commemorates."
  - "Second paragraph: how the public can take part."

# ---- Operating frequencies and modes --------------------------------------
frequencies:
  - frequency: "14.250 MHz"
    mode: "SSB (voice)"
    notes: "Example row. Replace with real operating plans."

# ---- Schedule -------------------------------------------------------------
schedule:
  - time: "2:00 PM"
    activity: "Operating begins"

# ---- QSL cards and certificates -------------------------------------------
# Don't publish a home address. Use an online route, a PO box, or a QSL
# manager's public instructions.
qsl:
  how: "How to request a QSL card."
  certificate: "Certificate details, if any."
  url: ""                     # link to a page with details
  url_label: "QSL and certificate details"

# ---- Photo gallery --------------------------------------------------------
# alt text is required for accessibility. Add width/height (pixels) to
# prevent layout shift.
gallery:
  - src: /assets/img/special-events/<slug>/station.jpg
    alt: "Describe what the photo shows"
    caption: "Optional caption"
    width: 1200
    height: 800

# ---- Contact --------------------------------------------------------------
# Defaults to the site-wide contact link from data/site.yaml. Override only
# if this event has its own public contact.
# contact:
#   label: "Email the organizers"
#   url: "mailto:events@example.com"
#   note: "Questions about the event?"

# ---- Housekeeping ---------------------------------------------------------
# updated: "2027-05-01"       # set when you change dates/times (helps calendar apps)
# sample: true                # marks a placeholder page; hidden from search engines
---

Anything written down here (below the second ---) is optional free-form text.
Markdown works. It appears at the bottom of the page, above the contact box.
Delete this paragraph if you don't need it.
