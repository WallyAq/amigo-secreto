const form = document.querySelector("#participant-form");
const nameInput = document.querySelector("#participant-name");
const addButton = document.querySelector("#add-participant-button");
const participantList = document.querySelector("#participant-list");
const participantCount = document.querySelector("#participant-count");
const formMessage = document.querySelector("#form-message");
const drawButton = document.querySelector("#draw-button");
const codesSection = document.querySelector("#codes-section");
const codeList = document.querySelector("#code-list");
const codeForm = document.querySelector("#code-form");
const codeInput = document.querySelector("#access-code");
const codeSubmitButton = document.querySelector("#code-submit-button");
const codeMessage = document.querySelector("#code-message");
const personalResult = document.querySelector("#personal-result");
const recipientName = document.querySelector("#recipient-name");
const hideResultButton = document.querySelector("#hide-result-button");
const downloadCodesButton = document.querySelector("#download-codes-button");

let participants = [];
let generatedCodes = [];
let drawComplete = false;
let drawPending = false;

function clearPersonalResult() {
  personalResult.hidden = true;
  recipientName.textContent = "";
}

function renderParticipants() {
  participantList.replaceChildren();

  participants.forEach((name, index) => {
    const item = document.createElement("li");
    item.className = "participant-item";

    const label = document.createElement("span");
    label.textContent = name;

    const removeButton = document.createElement("button");
    removeButton.className = "remove-button";
    removeButton.type = "button";
    removeButton.disabled = drawPending;
    removeButton.setAttribute("aria-label", `Remover ${name}`);
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => {
      if (drawPending) {
        return;
      }
      participants.splice(index, 1);
      formMessage.textContent = "";
      renderParticipants();
    });

    item.append(label, removeButton);
    participantList.append(item);
  });

  participantCount.textContent =
    participants.length === 1 ? "1 pessoa" : `${participants.length} pessoas`;
  form.hidden = drawComplete;
  participantList.hidden = drawComplete;
  drawButton.hidden = drawComplete;
  nameInput.disabled = drawPending;
  addButton.disabled = drawPending;
  drawButton.disabled = drawPending || participants.length < 2;
}

function renderCodeList(codes) {
  generatedCodes = codes;
  codeList.replaceChildren();

  codes.forEach(({ name, code }) => {
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

function getSupabaseConfig() {
  const config = window.SUPABASE_CONFIG;
  if (
    !config ||
    typeof config.url !== "string" ||
    typeof config.publishableKey !== "string" ||
    config.url.includes("YOUR_PROJECT_ID") ||
    config.publishableKey.includes("YOUR_SUPABASE_PUBLISHABLE_KEY") ||
    config.publishableKey.startsWith("sb_secret_")
  ) {
    throw new Error(
      "Configure a URL do projeto e a chave publishable em supabase-config.js; nunca use uma chave secret.",
    );
  }

  const url = config.url.replace(/\/+$/, "");
  if (!url.startsWith("https://")) {
    throw new Error("A URL do Supabase deve começar com https://.");
  }

  return { url, publishableKey: config.publishableKey };
}

async function callRpc(functionName, payload) {
  const config = getSupabaseConfig();
  const response = await fetch(
    `${config.url}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const responseText = await response.text();
  let responseData = null;

  if (responseText) {
    try {
      responseData = JSON.parse(responseText);
    } catch {
      if (response.ok) {
        throw new Error("O Supabase retornou uma resposta inválida.");
      }
    }
  }

  if (!response.ok) {
    const message =
      responseData &&
      (responseData.message || responseData.error_description || responseData.error);
    throw new Error(message || `Falha na comunicação com o Supabase (${response.status}).`);
  }

  return responseData;
}

async function startDraw() {
  if (participants.length < 2 || drawPending) {
    return;
  }

  drawPending = true;
  formMessage.textContent = "Salvando participantes e realizando o sorteio...";
  renderParticipants();

  try {
    const result = await callRpc("create_secret_draw", {
      p_names: participants,
    });

    if (
      !result ||
      !Array.isArray(result.codes) ||
      result.codes.length !== participants.length ||
      result.codes.some(
        (item) =>
          !item ||
          !participants.includes(item.name) ||
          typeof item.code !== "string" ||
          !/^[0-9A-F]{16}$/.test(item.code),
      )
    ) {
      throw new Error("O Supabase retornou códigos em um formato inesperado.");
    }

    drawComplete = true;
    formMessage.textContent = "";
    renderParticipants();
    renderCodeList(result.codes);
    codesSection.hidden = false;
    codesSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    formMessage.textContent = `Não foi possível criar o sorteio. ${error.message}`;
  } finally {
    drawPending = false;
    renderParticipants();
  }
}

function downloadCodes() {
  try {
    const contents = generatedCodes
      .map(({ name, code }) => `${name.replace(/[\r\n]/g, " ")}: ${code}`)
      .join("\r\n");
    const downloadUrl = URL.createObjectURL(
      new Blob([contents], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "codigos-amigo-secreto.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  } catch (error) {
    formMessage.textContent = `Não foi possível baixar a lista de códigos. ${error.message}`;
  }
}

async function showPersonalResult(event) {
  event.preventDefault();
  clearPersonalResult();

  const code = codeInput.value.replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9A-F]{16}$/.test(code)) {
    codeMessage.textContent = "Digite o código de 16 caracteres recebido.";
    return;
  }

  codeSubmitButton.disabled = true;
  codeMessage.textContent = "Consultando código...";

  try {
    const result = await callRpc("reveal_secret_draw", {
      p_code: code,
    });

    if (result && result.status === "used") {
      codeMessage.textContent =
        "Este código já foi consultado e não pode ser usado novamente.";
      return;
    }

    if (!result || result.status !== "ok" || typeof result.recipient !== "string") {
      codeMessage.textContent = "Código inválido. Confira o código e tente novamente.";
      return;
    }

    codeMessage.textContent = "";
    recipientName.textContent = result.recipient;
    personalResult.hidden = false;
    codeInput.value = "";
  } catch (error) {
    codeMessage.textContent = `Não foi possível consultar o código. ${error.message}`;
  } finally {
    codeSubmitButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (drawPending || drawComplete) {
    return;
  }

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
  renderParticipants();
  nameInput.focus();
});

codeInput.addEventListener("input", () => {
  clearPersonalResult();
  codeMessage.textContent = "";
});

codeForm.addEventListener("submit", showPersonalResult);
drawButton.addEventListener("click", startDraw);
hideResultButton.addEventListener("click", clearPersonalResult);
downloadCodesButton.addEventListener("click", downloadCodes);

renderParticipants();
