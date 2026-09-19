"use strict";

const $ = (id) => document.getElementById(id);
const form = $("settings");
const solveButton = $("solve");
const statuses = {
  OPTIMAL: "Optimal for this teaching model",
  FEASIBLE: "Feasible · a better schedule may exist",
  INFEASIBLE: "Infeasible within these eight weeks",
  UNKNOWN: "Search ended without a conclusive result",
  MODEL_INVALID: "The solver could not validate this model",
};
const steps = [
  {
    title: "Turn a planning question into a mathematical model.",
    body: "The solver needs three things: decisions it can make, rules it must respect, and an objective that describes a better result.",
    points: [
      "Choices: 48 yes/no variables say whether each of six work orders gets an access in each of eight weeks.",
      "Hard rules: deliver all nine accesses, stay within weekly capacity, avoid closed weeks and respect enabled predecessors.",
      "Objective: minimise the sum of weeks late × priority weight. A cheaper plan can never buy its way out of a hard rule.",
    ],
    formula: "x[j, w] ∈ {0, 1}\nΣ weeks x[j, w] = accesses[j]\nminimise Σ jobs weight[j] × weeksLate[j]",
  },
  {
    title: "Remove impossible choices. Search what remains.",
    body: "CP-SAT combines constraint reasoning with SAT search. It does not need to list every complete timetable before finding a solution.",
    points: [
      "Propagate: deduce consequences of the rules and current choices. Closing week 2 forces all six choices in that column to zero.",
      "Branch and learn: try a remaining choice; when it leads to a conflict, backtrack and learn a restriction to avoid that conflict again.",
      "Improve and bound: retain a valid candidate while searching for a lower delay. Bounds can rule out regions that cannot improve it.",
    ],
    formula: "Closed week ⇒ x[j, w] = 0\nPredecessor unfinished ⇒ successor cannot start\nKeep improving the best valid candidate",
  },
  {
    title: "A schedule and a statement of what was proved.",
    body: "Finding a valid plan and proving it is the best are different outcomes. The solver reports that distinction; RailPlan then checks and explains the returned schedule.",
    points: [
      "Optimal: the lowest objective is proved for this model. Feasible: a valid plan exists, but a better one may still exist.",
      "Infeasible: no plan satisfies this model. Unknown: search stopped without a solution or an infeasibility proof.",
      "Independent check: recount every access and recompute the rules and score. Placement explanations use those facts, not a fabricated search trace.",
    ],
    formula: "Best valid cost = proven lower bound\n⇒ optimal for this minimisation model\nThen independently check the returned plan",
  },
];
let model = null;
let result = null;
let selected = "A06";
let selectedStep = 0;
let busy = false;
let operation = 0;
let activeController = null;

function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function settings() {
  return {
    capacity: Number($("capacity").value),
    closedWeek: $("closed-week").value ? Number($("closed-week").value) : null,
    enforcePredecessors: $("predecessors").checked,
  };
}

function sameSettings(a, b) {
  return a && b && a.capacity === b.capacity && a.closedWeek === b.closedWeek && a.enforcePredecessors === b.enforcePredecessors;
}

function settingsText(value) {
  return `${value.capacity} ${value.capacity === 1 ? "access" : "accesses"}/week · ${value.closedWeek ? `W${value.closedWeek} unavailable` : "no closed week"} · predecessors ${value.enforcePredecessors ? "on" : "off"}`;
}

function setBusy(value) {
  busy = value;
  form.querySelectorAll("input,select,button").forEach((control) => { control.disabled = value; });
  solveButton.textContent = value ? "Solving…" : "Run CP-SAT";
  $("schedule").setAttribute("aria-busy", String(value));
  $("download").disabled = value || !result || !sameSettings(settings(), result.settings);
}

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}

async function request(path, payload, signal) {
  const response = await fetch(document.body.dataset.apiEndpoint || path, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : {},
    body: payload ? JSON.stringify(payload) : undefined,
    signal,
    cache: "no-store",
    credentials: "omit",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || "The solver service could not complete this request. Try again.");
  if (!data) throw new Error("The service returned an unreadable response. Try again.");
  return data;
}

function drawSchedule() {
  const body = $("schedule-body");
  body.replaceChildren();
  if (!model) return;
  const applied = result?.settings || settings();
  const hasPlan = result && ["OPTIMAL", "FEASIBLE"].includes(result.status);
  for (const job of model.jobs) {
    const solved = hasPlan ? result.jobs.find((candidate) => candidate.id === job.id) : null;
    const row = element("tr", undefined, job.id === selected ? "selected" : "");
    const heading = element("th");
    heading.scope = "row";
    const button = element("button");
    button.type = "button";
    button.setAttribute("aria-label", `Inspect ${job.id} ${job.name}`);
    button.setAttribute("aria-pressed", String(selected === job.id));
    button.append(element("span", job.id), element("span", job.name));
    button.addEventListener("click", () => selectJob(job.id));
    heading.append(button);
    row.append(heading);
    for (let week = 1; week <= model.horizon; week++) {
      const cell = element("td");
      if (week === job.dueWeek) cell.classList.add("due");
      if (week === applied.closedWeek) cell.classList.add("closed");
      if (solved?.weeks.includes(week)) {
        const access = element("button", "1", `access${week > job.dueWeek ? " late" : ""}`);
        access.type = "button";
        access.setAttribute("aria-label", `${job.id}, week ${week}, one access${week > job.dueWeek ? ", after due week" : ""}. Inspect placement`);
        access.addEventListener("click", () => selectJob(job.id));
        cell.append(access);
      } else {
        cell.append(element("span", week === applied.closedWeek ? "Unavailable" : "No access", "sr-only"));
      }
      if (week === job.dueWeek) cell.append(element("span", ` Due week ${week}`, "sr-only"));
      row.append(cell);
    }
    body.append(row);
  }
  const usage = $("usage-row");
  usage.replaceChildren();
  const label = element("th", "Used / available");
  label.scope = "row";
  usage.append(label);
  for (let week = 1; week <= model.horizon; week++) {
    const cap = result?.capacityByWeek?.[week - 1] ?? (week === applied.closedWeek ? 0 : applied.capacity);
    usage.append(element("td", `${hasPlan ? result.usageByWeek[week - 1] : "—"} / ${cap}`));
  }
  $("schedule-basis").textContent = result ? `Displayed result: ${settingsText(result.settings)}` : "Six work orders. Nine required accesses. Eight weeks. No schedule yet.";
}

function selectJob(id) {
  selected = id;
  document.querySelectorAll("#schedule-body tr").forEach((row, index) => {
    const isSelected = model.jobs[index].id === selected;
    row.classList.toggle("selected", isSelected);
    row.querySelector("th button").setAttribute("aria-pressed", String(isSelected));
  });
  drawExplanation();
}

function drawExplanation() {
  const box = $("explanation");
  box.replaceChildren();
  const job = result?.jobs.find((candidate) => candidate.id === selected);
  if (!job) {
    if (result?.status === "INFEASIBLE") {
      const available = result.capacityByWeek.reduce((sum, n) => sum + n, 0);
      box.append(element("p", available < 9 ? `Nine accesses are required, but these settings allow only ${available}. Increase weekly capacity to fit all the work.` : "No complete schedule meets these settings within eight weeks. Reopen the closed week or increase capacity."));
      box.append(element("p", "No partial plan is presented as a solution.", "hint"));
    } else box.append(element("p", "Select a work order after solving.", "muted"));
    return;
  }
  box.append(element("h3", `${job.id} · ${job.name}`));
  box.append(element("p", `${job.accesses} ${job.accesses === 1 ? "access" : "accesses"} · due W${job.dueWeek} · weight ${job.weight}`, "job-id"));
  box.append(element("p", job.explanation));
  box.append(element("p", `${job.tardiness} ${job.tardiness === 1 ? "week" : "weeks"} late × ${job.weight} = ${job.penalty} delay points`, "calculation"));
  box.append(element("p", "These facts explain the returned placement. Equivalent schedules may exist.", "hint"));
}

function renderResult(previous) {
  const feasible = ["OPTIMAL", "FEASIBLE"].includes(result.status);
  $("run-status").textContent = statuses[result.status] || "Unexpected solver status";
  $("run-status").dataset.kind = feasible ? "success" : "warning";
  $("run-meta").textContent = `${result.cache?.hit ? "Cached solve" : "Solver"} · ${result.solverMs.toFixed(1)} ms`;
  $("jobs-metric").textContent = `${feasible ? result.jobs.length : "—"} / ${model.jobs.length}`;
  $("accesses-metric").textContent = `${feasible ? result.jobs.reduce((sum, job) => sum + job.weeks.length, 0) : "—"} / 9`;
  $("cost-metric").textContent = feasible ? String(result.objective) : "No plan";
  if (previous && !sameSettings(previous.settings, result.settings) && feasible && previous.jobs.length) {
    const changed = result.jobs.filter((job) => JSON.stringify(job.weeks) !== JSON.stringify(previous.jobs.find((old) => old.id === job.id)?.weeks)).length;
    $("comparison").textContent = `Since your previous solve: ${changed} of 6 work orders changed. Weighted delay ${previous.objective} → ${result.objective}. All 9 accesses retained.`;
  } else $("comparison").textContent = feasible ? "Every required access is scheduled. Lower weighted delay is better; it is not the PS1 competition score." : result.status === "INFEASIBLE" ? "No complete plan fits these rules. Increase capacity or reopen a week, then run again." : "No conclusive schedule is available. Try running the model again.";
  $("proof-summary").textContent = `${result.engine} ${result.engineVersion}. ${statuses[result.status] || result.status}. ${feasible ? `Objective ${result.objective}; best bound ${result.bestBound}. ` : ""}${result.cache?.hit ? "This response reused a previously solved configuration. " : ""}Original solver time: ${result.solverMs.toFixed(1)} ms, excluding request and page load. Model: ${result.modelVersion}.`;
  $("checks").replaceChildren(...result.checks.map((check) => element("li", `${check.passed ? "Pass" : "Fail"} — ${check.label}: ${check.detail}`)));
  $("settings-state").textContent = "Settings match the displayed result.";
  $("settings-state").classList.remove("dirty");
  drawSchedule();
  drawExplanation();
  drawStep();
}

function drawStep() {
  const step = steps[selectedStep];
  $("step-title").textContent = step.title;
  $("step-description").textContent = step.body;
  $("step-points").replaceChildren(...step.points.map((point) => element("li", point)));
  $("step-formula").textContent = step.formula;
  let example = "Replace rail needs two accesses. Selecting weeks 2 and 3 sets those two choices to 1 and the other six to 0.";
  if (selectedStep === 1) example = result?.settings.closedWeek ? `Week ${result.settings.closedWeek} is closed in the displayed run. All six work orders must avoid it. With predecessors enabled, Test signals must also wait for Replace rail to finish.` : "Try closing week 2 above. Rail replacement must move, which can also push signal testing and route verification later.";
  if (selectedStep === 2) example = result?.status === "OPTIMAL" ? `Current result: weighted delay ${result.objective}, proven lower bound ${result.bestBound}. They match, so the solver reports OPTIMAL. Open the checks below to inspect the independent verification.` : result?.status === "INFEASIBLE" ? "This run proved infeasible within the fixed eight-week horizon. The demo returns no partial plan; increase capacity or reopen a week to try again." : "Run the demo to see its actual status, objective and bound. An independent check verifies feasibility; it does not itself prove optimality.";
  $("step-example").textContent = example;
}

async function solve() {
  if (busy) return;
  const epoch = ++operation;
  activeController?.abort();
  activeController = new AbortController();
  const controller = activeController;
  const timeout = setTimeout(() => controller.abort(), 20000);
  const previous = result;
  showError("");
  setBusy(true);
  $("run-status").textContent = "Solving the constrained model…";
  $("run-status").dataset.kind = "pending";
  $("settings-state").textContent = "Running CP-SAT. The previous result stays visible until this run finishes.";
  try {
    if (!model) {
      model = await request("/api/model", null, controller.signal);
      applyInitialParameters();
      drawSchedule();
    }
    const next = await request("/api/solve", settings(), controller.signal);
    if (epoch !== operation) return;
    if (!statuses[next.status] || !Array.isArray(next.jobs) || !Array.isArray(next.checks) || typeof next.solverMs !== "number") throw new Error("The service returned an unexpected result. Try again.");
    result = next;
    renderResult(previous);
    const url = new URL(window.location.href);
    url.searchParams.set("capacity", String(result.settings.capacity));
    if (result.settings.closedWeek) url.searchParams.set("week", String(result.settings.closedWeek));
    else url.searchParams.delete("week");
    if (!result.settings.enforcePredecessors) url.searchParams.set("predecessors", "off");
    else url.searchParams.delete("predecessors");
    window.history.replaceState(null, "", url);
  } catch (error) {
    if (epoch !== operation) return;
    showError(error.name === "AbortError" ? "The request timed out. Your previous result is preserved. Check your connection and run again." : error.message || "Could not reach the solver. Check your connection and run again.");
    $("run-status").textContent = previous ? "Request failed · previous result displayed" : "Solver unavailable · no result";
    $("run-status").dataset.kind = "warning";
    $("settings-state").textContent = "Try Run CP-SAT again to retry.";
  } finally {
    clearTimeout(timeout);
    if (epoch === operation) setBusy(false);
  }
}

function applyInitialParameters() {
  const params = new URLSearchParams(window.location.search);
  if (["1", "2", "3"].includes(params.get("capacity"))) $("capacity").value = params.get("capacity");
  if (/^[1-8]$/.test(params.get("week") || "")) $("closed-week").value = params.get("week");
  if (params.get("predecessors") === "off") $("predecessors").checked = false;
}

form.addEventListener("submit", (event) => { event.preventDefault(); solve(); });
form.addEventListener("change", () => {
  const dirty = !sameSettings(settings(), result?.settings);
  $("settings-state").textContent = dirty ? "Settings changed. Run CP-SAT to update the schedule." : "Settings match the displayed result.";
  $("settings-state").classList.toggle("dirty", dirty);
  $("download").disabled = dirty || !result;
});

document.querySelectorAll("[data-step]").forEach((button) => {
  button.disabled = false;
  button.addEventListener("click", () => {
    selectedStep = Number(button.dataset.step);
    document.querySelectorAll("[data-step]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    drawStep();
    if (selectedStep === 2) $("proof").open = true;
  });
});

$("download").addEventListener("click", () => {
  if (!result || busy || !sameSettings(settings(), result.settings)) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
  const link = element("a");
  link.href = url;
  link.download = "railplan-teaching-model-result.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

drawStep();
solve();
