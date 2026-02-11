(function () {
  var phase1 = document.getElementById("intro-phase-1");
  var phase2 = document.getElementById("intro-phase-2");
  var strongLine = document.getElementById("intro-strong");
  var line2 = document.getElementById("intro-line-2");
  var line3 = document.getElementById("intro-line-3");
  var line4 = document.getElementById("intro-line-4");
  var continueButton = document.getElementById("intro-continue");
  var blackout = document.getElementById("intro-blackout");

  if (!phase1 || !phase2 || !strongLine || !line2 || !line3 || !line4 || !continueButton || !blackout) return;

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function typeAppend(el, text, speed) {
    for (var i = 0; i < text.length; i += 1) {
      el.textContent += text.charAt(i);
      await sleep(speed);
    }
  }

  async function typeLine(el, text, speed) {
    el.textContent = "";
    await typeAppend(el, text, speed);
  }

  async function flashBlackout() {
    var fadeMs = 600;
    var holdBlackMs = 1000;
    blackout.classList.add("active");
    await sleep(fadeMs + holdBlackMs);
    blackout.classList.remove("active");
    await sleep(fadeMs + 300);
  }

  async function blackoutToNextLine(el, text, speed) {
    var fadeMs = 600;
    var holdBlackMs = 1000;
    blackout.classList.add("active");
    await sleep(fadeMs + holdBlackMs);
    el.textContent = "";
    blackout.classList.remove("active");
    await sleep(fadeMs + 120);
    await typeLine(el, text, speed);
  }

  async function runIntro() {
    var slowFactor = 2 / 0.6;
    var phase1Speed = Math.round(32 * slowFactor);
    var phase2Speed = Math.round(28 * slowFactor);

    // Hard reset to prevent stale text flashes on reload/back navigation.
    phase1.textContent = "";
    strongLine.textContent = "";
    line2.textContent = "";
    line3.textContent = "";
    line4.textContent = "";
    phase1.classList.remove("fading");
    phase2.classList.remove("fading");
    phase1.classList.add("hidden");
    phase2.classList.add("hidden");
    continueButton.classList.add("hidden");
    continueButton.classList.remove("visible");
    blackout.classList.remove("active");

    await sleep(20);
    phase1.classList.remove("hidden");

    await typeLine(phase1, "Welcome,\nDragonslayer.", phase1Speed);
    await sleep(2000);
    await blackoutToNextLine(phase1, "You've found the entrance to The Examination.", phase1Speed);
    await sleep(2000);
    await blackoutToNextLine(phase1, "It's not too late to turn back.", phase1Speed);
    await sleep(2000);
    await blackoutToNextLine(phase1, "but, quitting now was never really an option, was it?", phase1Speed);
    await sleep(2000);
    blackout.classList.add("active");
    await sleep(1600);

    phase1.classList.add("hidden");
    phase2.classList.remove("hidden");
    blackout.classList.remove("active");
    await sleep(700);

    await typeLine(strongLine, "Before you enter, understand this:", Math.round(30 * slowFactor));
    await sleep(300);
    await typeLine(line2, "No house wins alone.", phase2Speed);
    await typeLine(line3, "No answer stands without reason.", phase2Speed);
    await typeLine(
      line4,
      "No effort is wasted, only revealed.\n\nIf you are willing to be examined, step forward.",
      phase2Speed
    );

    continueButton.classList.remove("hidden");
    continueButton.classList.add("visible");
  }

  runIntro();
})();
