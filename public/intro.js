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
    blackout.classList.add("active");
    await sleep(450);
    blackout.classList.remove("active");
    await sleep(300);
  }

  async function runIntro() {
    var slowFactor = 2 / 0.6;
    var phase1Speed = Math.round(32 * slowFactor);
    var phase2Speed = Math.round(28 * slowFactor);

    phase1.textContent = "";
    await typeAppend(phase1, "Welcome,\n", phase1Speed);
    await typeAppend(phase1, "Dragonslayer.\n\n", phase1Speed);
    await typeAppend(phase1, "You've found the entrance to The Examination.", phase1Speed);
    await flashBlackout();

    phase1.textContent += "\nIt's not too late to turn back.";
    await flashBlackout();

    phase1.textContent += "\nbut, quitting now was never really an option, was it?";
    await flashBlackout();

    phase1.classList.add("fading");
    await sleep(700);
    phase1.classList.add("hidden");
    phase2.classList.remove("hidden");

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
