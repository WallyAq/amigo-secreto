const STORAGE_KEY = "amigo-secreto-state-v1";
const CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const form = document.querySelector("#participant-form");
const nameInput = document.querySelector("#participant-name");
const participantList = document.querySelector("#participant-list");
const participantCount = document.querySelector("#participant-count");
const formMessage = document.querySelector("#form-message");
const drawButton = document.querySelector("#draw-button");
const codesSection = document.querySelector("#codes-section");
const codeList = document.querySelector("#code-list");
const redrawButton = document.querySelector("#redraw-button");
const accessSection = document.querySelector("#access-section");
const codeForm = document.querySelector("#code-form");
const codeInput = document.querySelector("#access-code");
const codeMessage = document.querySelector("#code-message");
const personalResult = document.querySelector("#personal-result");
const recipientName = document.querySelector("#recipient-name");
const hideResultButton = document.querySelector("#hide-result-button");

let participants = [];
let assignments = [];

function isValidState(state) {
  if (
    !state ||
    !Array.isArray(state.participants) ||
    !state.participants.every((name) => typeof name === "string" && name.trim()) ||
    !Array.isArray(state.assignments)
  ) {
    return false;
  }

  if (state.assignments.length === 0) {
    return true;
  }

  const participantNames = new Set(state.participants);
  const givers = new Set();
  const recipients = new Set();
  const codes = new Set();

  return (
    state.assignments.length === state.participants.length &&
    state.assignments.every((assignment) => {
      if (
        !assignment ||
        !participantNames.has(assignment.name) ||
        !participantNames.has(assignment.recipient) ||
        assignment.name === assignment.recipient ||
        typeof assignment.code !== "string" ||
        !/^[A-HJ-NP-Z2-9]{8}$/.test(assignment.code) ||
        (assignment.used !== undefined && typeof assignment.used !== "boolean") ||
        givers.has(assignment.name) ||
        recipients.has(assignment.recipient) ||
        codes.has(assignment.code)
      ) {
        return false;
      }

      givers.add(assignment.name);
      recipients.add(assignment.recipient);
      codes.add(assignment.code);
      return true;
    })
  );
}

function restoreState() {
  try {
    const savedState = window.localStorage.getItem(STORAGE_KEY);
    if (!savedState) {
      return;
    }

    const state = JSON.parse(savedState);
    if (!isValidState(state)) {
      formMessage.textContent =
        "Os dados salvos estão inválidos. Remova os dados deste site para começar novamente.";
      return;
    }

    participants = state.participants;
    assignments = state.assignments.map((assignment) => ({
      ...assignment,
      used: assignment.used === true,
    }));
  } catch {
    formMessage.textContent =
      "Não foi possível carregar os dados salvos neste navegador.";
  }
}

function saveState() {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ participants, assignments }),
    );
    return true;
  } catch {
    formMessage.textContent =
      "Não foi possível salvar neste navegador. Mantenha esta página aberta para não perder o sorteio.";
    return false;
  }
}

function clearPersonalResult() {
  personalResult.hidden = true;
  recipientName.textContent = "";
}

function clearDraw() {
  assignments = [];
  codesSection.hidden = true;
  accessSection.hidden = true;
  codeList.replaceChildren();
  codeMessage.textContent = "";
  clearPersonalResult();
}

function renderParticipants() {
  participantList.replaceChildren();
  const drawIsComplete = assignments.length > 0;

  participants.forEach((name, index) => {
    const item = document.createElement("li");
    item.className = "participant-item";

    const label = document.createElement("span");
    label.textContent = name;
    item.append(label);

    if (!drawIsComplete) {
      const removeButton = document.createElement("button");
      removeButton.className = "remove-button";
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", `Remover ${name}`);
      removeButton.textContent = "×";
      removeButton.addEventListener("click", () => {
        participants.splice(index, 1);
        clearDraw();
        formMessage.textContent = "";
        saveState();
        renderParticipants();
      });
      item.append(removeButton);
    }

    participantList.append(item);
  });

  participantCount.textContent =
    participants.length === 1 ? "1 pessoa" : `${participants.length} pessoas`;
  form.hidden = drawIsComplete;
  participantList.hidden = drawIsComplete;
  drawButton.hidden = drawIsComplete;
  drawButton.disabled = participants.length < 2;
}

function drawNames() {
  const recipients = [...participants];

  do {
    for (let index = recipients.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [recipients[index], recipients[randomIndex]] = [
        recipients[randomIndex],
        recipients[index],
      ];
    }
  } while (recipients.some((name, index) => name === participants[index]));

  return recipients;
}

function generateCode(existingCodes) {
  if (!window.crypto || !window.crypto.getRandomValues) {
    return null;
  }

  let code;
  do {
    const randomBytes = new Uint8Array(8);
    window.crypto.getRandomValues(randomBytes);
    code = Array.from(
      randomBytes,
      (byte) => CODE_CHARACTERS[byte % CODE_CHARACTERS.length],
    ).join("");
  } while (existingCodes.has(code));

  return code;
}

function renderCodeList() {
  codeList.replaceChildren();

  assignments.forEach(({ name, code }) => {
    const item = document.createElement("li");
    item.className = "code-item";

    const participant = document.createElement("span");
    participant.className = "code-owner";
    participant.textContent = name;

    const accessCode = document.createElement("code");
    accessCode.className = "access-code";
    accessCode.textContent = code;

    item.append(participant, accessCode);
    codeList.append(item);
  });
}

function startDraw() {
  if (participants.length < 2) {
    return;
  }

  if (!window.crypto || !window.crypto.getRandomValues) {
    formMessage.textContent =
      "Este navegador não oferece geração segura de códigos. Atualize o navegador para continuar.";
    return;
  }

  const recipients = drawNames();
  const codes = new Set();
  const newAssignments = participants.map((name, index) => {
    const code = generateCode(codes);
    if (!code) {
      return null;
    }
    codes.add(code);
    return { name, recipient: recipients[index], code };
  });

  if (newAssignments.some((assignment) => assignment === null)) {
    formMessage.textContent = "Não foi possível gerar os códigos. Tente novamente.";
    return;
  }

  assignments = newAssignments;
  formMessage.textContent = "";
  codeMessage.textContent = "";
  clearPersonalResult();
  saveState();
  renderParticipants();
  renderCodeList();
  codesSection.hidden = false;
  accessSection.hidden = false;
  codesSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showPersonalResult(event) {
  event.preventDefault();
  clearPersonalResult();

  const code = codeInput.value.replace(/\s+/g, "").toUpperCase();
  const assignment = assignments.find((item) => item.code === code);

  if (!assignment) {
    codeMessage.textContent = "Código inválido. Confira o código e tente novamente.";
    return;
  }

  if (assignment.used) {
    codeMessage.textContent = "Este código já foi consultado e não pode ser usado novamente.";
    return;
  }

  assignment.used = true;
  if (!saveState()) {
    assignment.used = false;
    codeMessage.textContent =
      "Não foi possível registrar a consulta. O resultado não foi exibido; verifique o armazenamento do navegador e tente novamente.";
    return;
  }

  codeMessage.textContent = "";
  recipientName.textContent = assignment.recipient;
  personalResult.hidden = false;
  codeInput.value = "";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();

  if (!name) {
    formMessage.textContent = "Digite um nome para adicionar.";
    nameInput.focus();
    return;
  }

  const alreadyExists = participants.some(
    (participant) =>
      participant.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"),
  );

  if (alreadyExists) {
    formMessage.textContent = "Esse nome já está na lista.";
    nameInput.focus();
    return;
  }

  participants.push(name);
  nameInput.value = "";
  formMessage.textContent = "";
  saveState();
  renderParticipants();
  nameInput.focus();
});

codeInput.addEventListener("input", () => {
  clearPersonalResult();
  codeMessage.textContent = "";
});

codeForm.addEventListener("submit", showPersonalResult);
drawButton.addEventListener("click", startDraw);
redrawButton.addEventListener("click", () => {
  clearDraw();
  formMessage.textContent = "";
  saveState();
  renderParticipants();
  startDraw();
});
hideResultButton.addEventListener("click", clearPersonalResult);

restoreState();
renderParticipants();
if (assignments.length > 0) {
  renderCodeList();
  codesSection.hidden = false;
  accessSection.hidden = false;
}
