(function () {
  var phase1 = document.getElementById("intro-phase-1");
  var phase2 = document.getElementById("intro-phase-2");
  var strongLine = document.getElementById("intro-strong");
  var line2 = document.getElementById("intro-line-2");
  var line3 = document.getElementById("intro-line-3");
  var line4 = document.getElementById("intro-line-4");
  var continueButton = document.getElementById("intro-continue");

  if (!phase1 || !phase2 || !strongLine || !line2 || !line3 || !line4 || !continueButton) return;

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function typeLine(el, text, speed) {
    el.textContent = "";
    for (var i = 0; i < text.length; i += 1) {
      el.textContent += text.charAt(i);
      await sleep(speed);
    }
  }

  async function runIntro() {
    var slowFactor = 2 / 0.6;
    await typeLine(
      phase1,
      "Ah. You've found your way here.\nMost do not.\nOnly a few continue.\nYet fewer still Finish.",
      Math.round(32 * slowFactor)
    );

    await sleep(900);
    phase1.classList.add("fading");
    await sleep(700);
    phase1.classList.add("hidden");
    phase2.classList.remove("hidden");

    await typeLine(strongLine, "Before you enter, understand this:", Math.round(30 * slowFactor));
    await sleep(300);
    await typeLine(line2, "No house wins alone.", Math.round(28 * slowFactor));
    await typeLine(line3, "No answer stands without reason.", Math.round(28 * slowFactor));
    await typeLine(
      line4,
      "No effort is wasted, only revealed.\n\nIf you are willing to be examined, step forward.",
      Math.round(28 * slowFactor)
    );

    continueButton.classList.remove("hidden");
    continueButton.classList.add("visible");
  }

  runIntro();
})();
