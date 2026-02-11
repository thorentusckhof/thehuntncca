(function () {
  var elements = Array.prototype.slice.call(document.querySelectorAll("[data-gate-countdown]"));
  if (!elements.length) return;

  function formatRemaining(ms) {
    var totalSeconds = Math.max(0, Math.floor(ms / 1000));
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return hours + "h " + String(minutes).padStart(2, "0") + "m " + String(seconds).padStart(2, "0") + "s";
  }

  function tick() {
    var now = Date.now();
    elements.forEach(function (el) {
      var unlockAt = new Date(el.getAttribute("data-gate-countdown")).getTime();
      var remaining = unlockAt - now;
      if (remaining <= 0) {
        el.textContent = "Open now";
      } else {
        el.textContent = "Opens in " + formatRemaining(remaining);
      }
    });
  }

  tick();
  setInterval(tick, 1000);
})();
