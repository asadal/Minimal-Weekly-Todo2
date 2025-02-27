// popup.js

// 요일 배열
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// chrome.storage에 저장된 할일 데이터를 불러옵니다.
function loadAllTasks() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get("weeklyTasks", (data) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        const weeklyTasks = data.weeklyTasks || {
          Monday: [],
          Tuesday: [],
          Wednesday: [],
          Thursday: [],
          Friday: [],
          Saturday: [],
          Sunday: []
        };
        resolve(weeklyTasks);
      }
    });
  });
}

// 할일 데이터를 저장합니다.
function saveAllTasks(weeklyTasks) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ weeklyTasks }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// 할일 텍스트를 편집 모드로 전환하는 함수
function enableEditing(li, day, idx, currentText) {
  // 기존 텍스트 요소(.todo-text) 선택
  const oldTextEl = li.querySelector('.todo-text');
  if (!oldTextEl) return;

  // input 요소 생성
  const inputEl = document.createElement("input");
  inputEl.type = "text";
  inputEl.value = currentText;
  inputEl.classList.add("todo-edit-input");
  // input에 스타일을 적용하여 공간을 채우도록 함
  inputEl.style.flex = "1";
  
  // 기존 텍스트 요소를 input으로 교체
  li.replaceChild(inputEl, oldTextEl);
  inputEl.focus();

  // 저장 함수: 입력창 내용으로 할일 텍스트 업데이트 후 원래 span 또는 a로 복원
  const saveEdit = async () => {
    let newText = inputEl.value.trim();
    if (newText === "") {
      newText = currentText; // 빈값이면 원래 텍스트 유지
    }
    // 저장: chrome.storage 업데이트
    const allTasks = await loadAllTasks();
    allTasks[day][idx].text = newText;
    await saveAllTasks(allTasks);
    
    // 새 텍스트 요소 생성 및 클래스 추가
    let newTextEl;
    const urlRegex = /^(https?:\/\/[^\s]+)/;
    if (urlRegex.test(newText)) {
      newTextEl = document.createElement("a");
      newTextEl.href = newText;
      newTextEl.target = "_blank";
      newTextEl.rel = "noopener noreferrer";
    } else {
      newTextEl = document.createElement("span");
    }
    newTextEl.textContent = newText;
    newTextEl.classList.add("todo-text");
    
    // 클릭 시 다시 편집 모드로 전환
    newTextEl.addEventListener("click", () => {
      enableEditing(li, day, idx, newText);
    });
    
    // input을 새 텍스트 요소로 교체
    li.replaceChild(newTextEl, inputEl);
  };

  // Enter 키 입력 또는 포커스 아웃 시 저장
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      saveEdit();
    }
  });
  inputEl.addEventListener("blur", saveEdit);
}

// 특정 요일의 할일 목록(.todo-list)을 렌더링합니다.
function renderTodoList(day, tasks) {
  const ul = document.querySelector(`.todo-list[data-day="${day}"]`);
  if (!ul) return;
  ul.innerHTML = "";

  tasks.forEach((task, idx) => {
    const li = document.createElement("li");
    li.classList.add("todo-item");
    if (task.completed) {
      li.classList.add("completed");
    }

    // 체크박스 생성
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("todo-checkbox");
    checkbox.checked = task.completed;
    checkbox.addEventListener("change", async () => {
      const allTasks = await loadAllTasks();
      allTasks[day][idx].completed = checkbox.checked;
      await saveAllTasks(allTasks);
      li.classList.toggle("completed", checkbox.checked);
      updateDayBadges();
    });

    // 할일 텍스트 생성 (URL이면 <a> 태그, 아니면 <span>)
    const urlRegex = /^(https?:\/\/[^\s]+)/;
    let textEl;
    if (urlRegex.test(task.text)) {
      textEl = document.createElement("a");
      textEl.href = task.text;
      textEl.target = "_blank";
      textEl.rel = "noopener noreferrer";
    } else {
      textEl = document.createElement("span");
    }
    textEl.textContent = task.text;
    textEl.classList.add("todo-text");
    // 클릭 시 편집 모드로 전환
    textEl.addEventListener("click", () => {
      enableEditing(li, day, idx, task.text);
    });

    // 삭제 버튼 생성
    const delBtn = document.createElement("span");
    delBtn.classList.add("todo-delete");
    delBtn.textContent = "×";
    delBtn.addEventListener("click", async () => {
      const allTasks = await loadAllTasks();
      allTasks[day].splice(idx, 1);
      await saveAllTasks(allTasks);
      renderTodoList(day, allTasks[day]);
      updateDayBadges();
    });

    li.appendChild(checkbox);
    li.appendChild(textEl);
    li.appendChild(delBtn);
    ul.appendChild(li);
  });
}

// 모든 요일의 할일 목록을 렌더링합니다.
async function renderAllDays() {
  const allTasks = await loadAllTasks();
  days.forEach((day) => {
    renderTodoList(day, allTasks[day]);
  });
  updateDayBadges();
}

// 새 할일 추가 함수
async function addNewTask(day, taskText) {
  if (!taskText.trim()) return;
  const allTasks = await loadAllTasks();
  allTasks[day].push({ text: taskText.trim(), completed: false });
  await saveAllTasks(allTasks);
  renderTodoList(day, allTasks[day]);
  updateDayBadges();
}

// "+ Add task" 링크 클릭 시 새 할일 입력 폼을 토글합니다.
function setupAddTaskLinks() {
  const addLinks = document.querySelectorAll(".add-todo");
  addLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const day = link.dataset.day;
      const form = document.querySelector(`.new-todo-form[data-day="${day}"]`);
      if (form) {
        form.classList.toggle("active");
      }
    });
  });
}

// 새 할일 입력 폼(엔터 또는 버튼 클릭) 처리
function setupNewTodoForms() {
  const forms = document.querySelectorAll(".new-todo-form");
  forms.forEach((form) => {
    const day = form.dataset.day;
    const inputEl = form.querySelector(".new-todo-input");
    const submitBtn = form.querySelector(".new-todo-submit");

    submitBtn.addEventListener("click", () => {
      addNewTask(day, inputEl.value);
      inputEl.value = "";
      form.classList.remove("active");
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addNewTask(day, inputEl.value);
        inputEl.value = "";
        form.classList.remove("active");
      }
    });
  });
}

// 각 요일 헤더의 미완료 할일 수를 .day-badge에 업데이트합니다.
async function updateDayBadges() {
  const allTasks = await loadAllTasks();
  days.forEach((day) => {
    const badge = document.querySelector(`.day-badge[data-day="${day}"]`);
    if (!badge) return;
    const incompleteCount = allTasks[day].filter(task => !task.completed).length;
    badge.textContent = incompleteCount > 0 ? String(incompleteCount) : "";
  });
}

// 초기화: 링크, 폼 처리 및 렌더링 실행
async function init() {
  setupAddTaskLinks();
  setupNewTodoForms();
  await renderAllDays();
}

document.addEventListener("DOMContentLoaded", init);