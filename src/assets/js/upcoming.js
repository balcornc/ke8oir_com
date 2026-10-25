/*
 * Keeps "upcoming" lists honest between site rebuilds.
 *
 * The build already leaves out events that were over when the site was built.
 * This tiny script handles the gap: it removes events that have ended since
 * then, so an event leaves "Upcoming" at the right moment even if the site has
 * not been rebuilt. If JavaScript is off, the build-time lists simply stay as
 * they were built; nothing breaks.
 *
 * Markup contract (see src/_includes/partials/macros.njk):
 *   [data-upcoming-list]  <ol> of <li data-end="ISO-8601 UTC">
 *   [data-empty]          message shown when the list becomes empty
 *   [data-past-list]      (optional) <ol> that receives events that just ended
 *   [data-past]           (optional) <details> wrapper around the past list
 *   [data-past-count]     (optional) element showing the past-event count
 */
(function () {
  "use strict";

  function refresh() {
    var now = Date.now();
    var pastList = document.querySelector("[data-past-list]");
    var pastBox = document.querySelector("[data-past]");
    var pastCount = document.querySelector("[data-past-count]");
    var lists = document.querySelectorAll("[data-upcoming-list]");

    Array.prototype.forEach.call(lists, function (list) {
      var items = Array.prototype.slice.call(list.querySelectorAll(":scope > li[data-end]"));

      // Oldest first, so prepending leaves the most recent at the top of the past list.
      items.forEach(function (li) {
        var end = Date.parse(li.getAttribute("data-end"));
        if (isNaN(end) || end > now) return;
        if (pastList) {
          pastList.insertBefore(li, pastList.firstChild);
        } else {
          li.hidden = true;
        }
      });

      var remaining = list.querySelectorAll(":scope > li[data-end]:not([hidden])").length;
      var empty = list.parentNode.querySelector("[data-empty]");
      if (empty) empty.hidden = remaining > 0;
    });

    if (pastList) {
      var n = pastList.querySelectorAll(":scope > li").length;
      if (pastCount) pastCount.textContent = String(n);
      if (pastBox) pastBox.hidden = n === 0;
    }
  }

  refresh();
  // Pages left open overnight also stay correct.
  setInterval(refresh, 60 * 1000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refresh();
  });
})();
