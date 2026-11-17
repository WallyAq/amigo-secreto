const form = document.querySelector("#participant-form");
const nameInput = document.querySelector("#participant-name");
const addButton = document.querySelector("#add-participant-button");
const participantList = document.querySelector("#participant-list");
const participantCount = document.querySelector("#participant-count");
const sharedStatus = document.querySelector("#shared-status");
const formMessage = document.querySelector("#form-message");
const drawButton = document.querySelector("#draw-button");
const codesSection = document.querySelector("#codes-section");
const codesStatus = document.querySelector("#codes-status");
const organizerDetails = document.querySelector(".organizer-details");
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
let serverReady = false;
let drawComplete = false;
let mutationPending = false;
let stateRequestPending = false;

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
    removeButton.disabled = !serverReady || mutationPending || stateRequestPending;
    removeButton.setAttribute("aria-label", `Remover ${name}`);
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => removeParticipant(name));

    item.append(label, removeButton);
    participantList.append(item);
  });

  participantCount.textContent =
    participants.length === 1 ? "1 pessoa" : `${participants.length} pessoas`;
  form.hidden = drawComplete;
  participantList.hidden = drawComplete;
  drawButton.hidden = drawComplete;
  nameInput.disabled = !serverReady || mutationPending || stateRequestPending;
  addButton.disabled = !serverReady || mutationPending || stateRequestPending;
  drawButton.disabled =
    !serverReady ||
    mutationPending ||
    stateRequestPending ||
    participants.length < 2;
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

function applySharedState(state) {
  if (
    !state ||
    !Array.isArray(state.participants) ||
    !state.participants.every(
      (name) => typeof name === "string" && name.trim().length > 0,
    ) ||
    typeof state.draw_complete !== "boolean"
  ) {
    throw new Error("O Supabase retornou a lista compartilhada em formato inválido.");
  }

  participants = state.participants;
  drawComplete = state.draw_complete;
  serverReady = true;

  if (drawComplete) {
    codesSection.hidden = false;
    if (generatedCodes.length === 0) {
      organizerDetails.hidden = true;
      codesStatus.hidden = false;
      codesStatus.textContent =
        "O sorteio já foi realizado. Por segurança, os códigos não podem ser recuperados; use a lista que foi baixada ou distribuída no momento do sorteio.";
    } else {
      organizerDetails.hidden = false;
      codesStatus.hidden = true;
    }
  } else {
    codesSection.hidden = true;
    codesStatus.hidden = true;
    organizerDetails.hidden = false;
  }

  sharedStatus.textContent = drawComplete
    ? "O sorteio desta lista já foi realizado."
    : "Lista compartilhada: todos podem adicionar e remover nomes.";
  renderParticipants();
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
  const response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
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
    throw new Error(
      message || `Falha na comunicação com o Supabase (${response.status}).`,
    );
  }

  return responseData;
}

async function loadSharedState(silent = false) {
  if (stateRequestPending || mutationPending) {
    return;
  }

  stateRequestPending = true;
  renderParticipants();
  try {
    const state = await callRpc("get_secret_event_state", {});
    applySharedState(state);
    if (!silent) {
      formMessage.textContent = "";
    }
  } catch (error) {
    if (!silent || !serverReady) {
      formMessage.textContent = `Não foi possível carregar a lista compartilhada. ${error.message}`;
    } else {
      sharedStatus.textContent = `Não foi possível atualizar a lista. ${error.message}`;
    }
  } finally {
    stateRequestPending = false;
    renderParticipants();
  }
}

async function addParticipant(event) {
  event.preventDefault();
  if (!serverReady || mutationPending || stateRequestPending || drawComplete) {
    return;
  }

  const name = nameInput.value.trim();
  if (!name) {
    formMessage.textContent = "Digite um nome para adicionar.";
    nameInput.focus();
    return;
  }

  if (
    participants.some(
      (participant) =>
        participant.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"),
    )
  ) {
    formMessage.textContent = "Esse nome já está na lista compartilhada.";
    nameInput.focus();
    return;
  }

  mutationPending = true;
  formMessage.textContent = "Salvando o nome para todos...";
  renderParticipants();

  try {
    const state = await callRpc("add_secret_participant", { p_name: name });
    applySharedState(state);
    nameInput.value = "";
    formMessage.textContent = "";
    nameInput.focus();
  } catch (error) {
    formMessage.textContent = `Não foi possível salvar o nome. ${error.message}`;
  } finally {
    mutationPending = false;
    renderParticipants();
  }
}

async function removeParticipant(name) {
  if (!serverReady || mutationPending || stateRequestPending || drawComplete) {
    return;
  }

  mutationPending = true;
  formMessage.textContent = "Atualizando a lista compartilhada...";
  renderParticipants();

  try {
    const state = await callRpc("remove_secret_participant", {
      p_name: name,
    });
    applySharedState(state);
    formMessage.textContent = "";
  } catch (error) {
    formMessage.textContent = `Não foi possível remover o nome. ${error.message}`;
  } finally {
    mutationPending = false;
    renderParticipants();
  }
}

async function startDraw() {
  if (
    participants.length < 2 ||
    !serverReady ||
    mutationPending ||
    stateRequestPending
  ) {
    return;
  }

  mutationPending = true;
  formMessage.textContent = "Salvando a lista e realizando o sorteio...";
  renderParticipants();
  let shouldRefresh = false;

  try {
    const result = await callRpc("create_shared_secret_draw", {});
    if (
      !result ||
      !Array.isArray(result.codes) ||
      result.codes.length < 2 ||
      result.codes.some(
        (item) =>
          !item ||
          typeof item.name !== "string" ||
          typeof item.code !== "string" ||
          !/^[0-9A-F]{16}$/.test(item.code),
      ) ||
      new Set(result.codes.map((item) => item.name)).size !== result.codes.length
    ) {
      throw new Error("O Supabase retornou códigos em um formato inesperado.");
    }

    participants = result.codes.map((item) => item.name);
    drawComplete = true;
    formMessage.textContent = "";
    renderParticipants();
    renderCodeList(result.codes);
    codesStatus.hidden = true;
    organizerDetails.hidden = false;
    organizerDetails.open = true;
    codesSection.hidden = false;
    codesSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    formMessage.textContent = `Não foi possível criar o sorteio. ${error.message}`;
    shouldRefresh = true;
  } finally {
    mutationPending = false;
    renderParticipants();
  }

  if (shouldRefresh) {
    await loadSharedState(true);
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

codeInput.addEventListener("input", () => {
  clearPersonalResult();
  codeMessage.textContent = "";
});

form.addEventListener("submit", addParticipant);
codeForm.addEventListener("submit", showPersonalResult);
drawButton.addEventListener("click", startDraw);
hideResultButton.addEventListener("click", clearPersonalResult);
downloadCodesButton.addEventListener("click", downloadCodes);

renderParticipants();
formMessage.textContent = "Carregando a lista compartilhada...";
loadSharedState();
window.setInterval(() => loadSharedState(true), 5000);
