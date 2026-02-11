(function () {
  var promptEl = document.getElementById("sorting-prompt");
  var formEl = document.getElementById("sorting-flow-form");
  var firstStage = document.getElementById("first-name-stage");
  var lastStage = document.getElementById("last-name-stage");
  var houseStage = document.getElementById("house-stage");
  var firstInput = document.getElementById("first-name-input");
  var lastInput = document.getElementById("last-name-input");
  var houseInput = document.getElementById("house-input");
  var usernameInput = document.getElementById("username-input");
  var finalText = document.getElementById("sorting-final-text");
  var submitButton = document.getElementById("enter-hunt");

  if (
    !promptEl || !formEl || !firstStage || !lastStage || !houseStage ||
    !firstInput || !lastInput || !houseInput || !usernameInput || !finalText || !submitButton
  ) {
    return;
  }

  var flowLocked = false;

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function typeText(el, text, speed) {
    el.textContent = "";
    for (var i = 0; i < text.length; i += 1) {
      el.textContent += text.charAt(i);
      await sleep(speed);
    }
  }

  function slugifyUsername(value) {
    var slug = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24);
    return slug || "hunter";
  }

  function reveal(el) {
    el.classList.remove("hidden");
  }

  async function run() {
    await typeText(promptEl, "Enter your name", 70);
    reveal(firstStage);
    firstInput.required = true;
    firstInput.focus();
  }

  function maybeRevealLastName() {
    if (firstInput.value.trim() && lastStage.classList.contains("hidden")) {
      reveal(lastStage);
      lastInput.required = true;
    }
  }

  function maybeRevealHouse() {
    if (lastInput.value.trim() && houseStage.classList.contains("hidden")) {
      reveal(houseStage);
      houseInput.required = true;
    }
  }

  async function handleHouseChosen() {
    if (flowLocked) return;
    if (!houseInput.value) return;

    var firstName = firstInput.value.trim();
    var lastName = lastInput.value.trim();
    if (!firstName || !lastName) return;
    flowLocked = true;

    usernameInput.value = slugifyUsername(firstName + lastName);

    promptEl.classList.add("fading");
    firstStage.classList.add("fading");
    lastStage.classList.add("fading");
    houseStage.classList.add("fading");
    await sleep(500);
    promptEl.classList.add("hidden");
    firstStage.classList.add("hidden");
    lastStage.classList.add("hidden");
    houseStage.classList.add("hidden");

    await sleep(3000);

    reveal(finalText);
    await typeText(finalText, "Ah, Yes. " + firstName + " " + lastName + ".", 68);
    await sleep(400);
    finalText.textContent += "\nI wonder if what they say is true...";
    await sleep(1000);
    finalText.textContent += "\nI guess we'll find out.";

    reveal(submitButton);
  }

  firstInput.addEventListener("input", maybeRevealLastName);
  firstInput.addEventListener("blur", maybeRevealLastName);
  lastInput.addEventListener("input", maybeRevealHouse);
  lastInput.addEventListener("blur", maybeRevealHouse);
  houseInput.addEventListener("change", handleHouseChosen);

  run();
})();
